const amqp    = require('amqplib');
const Promise = require('bluebird');
const winston = require('winston');

let singleton = null;

function publish({ exchange, key, message, options = {} }) {
  if (key === undefined) {
    throw new Error('Parameter key must be defined');
  }
  if (message === undefined) {
    throw new Error('Parameter message must be defined');
  }

  return this.channel.publish(
    exchange || this.configuration.exchange, 
    key, 
    new Buffer(JSON.stringify(message)), 
    Object.assign({ persistent: true }, options)
  );
};

function bindQueue({ exchange, name, options }) {
  return this.channel.assertQueue(name, options).then((q) => {
    this.channel.bindQueue(q.queue, exchange || this.configuration.exchange, name);
    return q.queue;
  })
};

function consume(queue, callback) {
  return this.channel.consume(queue, (msg) => {
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
}

function create({ url, exchange } = {}) {
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
                    .then(() => instance)
                    .catch(() => {
                      if (singleton === instance) {
                        singleton = null;
                      }
                    });
  return instance;
};

module.exports = {
  create: create,
  get main() {
    console.log('MAIN CREATED');
    if (singleton === null) {
      singleton = create();
    }
    return singleton;
  }
};
