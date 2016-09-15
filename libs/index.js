const amqp    = require('amqplib');
const Promise = require('bluebird');
const winston = require('winston');
const assert  = require('assert');

let singleton = null;

function publish({ exchange, key, message, options = {} }) {
  assert.ok(message, 'Parameter message must be defined');
  key = key || '';

  const exchangeName = exchange || this.configuration.exchange;
  this.logger.info('Publish "' + JSON.stringify(message) + `" to "${key}" on exchange "${exchangeName}"`);

  return this.channel.publish(
    exchangeName, 
    key, 
    new Buffer(JSON.stringify(message)), 
    Object.assign({ persistent: true }, options)
  );
};

function bindQueue({ exchange, queue, pattern, options }) {
  assert.ok(exchange, 'Exchange parameter required');
  
  const exchangeName = exchange;
  const queueName = queue || this.configuration.exchange;
  pattern = pattern || '';

  this.logger.info(`Binded pattern "${pattern}" in exchange "${exchangeName}" to queue "${queueName}"`);
  
  return this.channel.assertQueue(queueName, options).then((q) => {
    this.channel.bindQueue(q.queue, exchangeName, pattern);
    return q.queue;
  });
};

function consume(queue, callback) {
  return this.channel.consume(queue, (msg) => {
    this.logger.info(`Message received "${msg}"`);
    msg.rawContent = msg.content;
    
    try {
      msg.content = JSON.parse(msg.content);
    } catch(e) { }

    callback(msg);
  });
};

function ack(message, allUpTo) {
  return this.channel.ack(message, allUpTo);
}

function close() {
  if (this.channel) {
    this.channel.close();
    this.channel = null;
  }

  if (this.conn) {
    this.conn.close();
    this.conn = null;
  }

  if (singleton === this) {
    singleton = null;
  }

  this.logger.info(`Connection to ${this.configuration.url} closed`);
}

function create({ url, exchange, logger } = {}) {
  let instance = {
    configuration: {
      url: url || process.env.RABBIT_URL,
      exchange: exchange || process.env.RABBIT_EXCHANGE //a définir ici le nom du packet si l'exchange n'est pas définit
    },
    publish: publish,
    ack: ack,
    bindQueue: bindQueue,
    consume: consume,
    close: close,
    logger: logger || winston,
    conn: null
  };

  if (singleton === null) {
    singleton = instance;
  }

  instance.ready = amqp
                    .connect(instance.configuration.url)
                    .then(conn => {
                      instance.conn = conn;
                      return conn.createChannel();
                    })
                    .then(channel => {
                      instance.channel = channel;
                      return channel.assertExchange(instance.configuration.exchange, 'topic', { durable: true });
                    })
                    .then(() => { 
                      instance.logger.info(`Connection to "${instance.configuration.url}" established and exchange "${instance.configuration.exchange}" asserted`);
                      return instance
                    });
  return instance;
};

module.exports = {
  create: create,
  get main() {
    if (singleton === null) {
      create();
    }

    return singleton;
  }
};
