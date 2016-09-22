require('should');
const assert    = require('assert');
const messaging = require('../libs/index.js');
const _         = require('lodash');
const Promise   = require('bluebird');

describe('Messaging ', () => {
  const message = {
    message: 'test',
    headers: {
      test: 'test'
    }
  };

  it('should establish connection', (done) => {
    const inst = messaging.main;
    inst.ready
          .then(() => { 
            inst.close(); 
            done(); 
          })
          .catch(done);
  });

  it('should publish message to exchange', (done) => {
    const inst = messaging.main;
    inst.ready.then(() => {
      return inst.publish({ 
        key:     'test', 
        message: { message: 'test message' }, 
        options: { expiration: 0 }
      });
    })
    .then(() => { inst.close(); done() })
    .catch(done);
  });

  it('should publish and receive 1 message', function(done) {
    const inst = messaging.main;
    inst.ready.then(() => {
      return inst.bindQueue({ exchange: process.env.RABBIT_EXCHANGE, name: 'test' });
    }).then((queue) => {
      let consumed = 0;
      const debounce = _.debounce(() => {
        if (consumed === 1) {
          inst.close();
          done();
        } else {
          done(new Error('More than one message received'));
        }
      }, 10);

      inst.consume(queue, (response) => {
        consumed++;
        
        inst.ack(response);
        assert.deepStrictEqual(response.content, message);
        debounce();
      });
    })
    .then(() => {
      inst.publish({ key: '', message: message });
    })
    .catch(done);
  });


  it('should fill our queue with messages from another exchange', function(done) {
    const instA = messaging.create({ url: process.env.RABBIT_URL, exchange: 'microServiceA' });
    const instB = messaging.create({ url: process.env.RABBIT_URL, exchange: 'microServiceB' });
    const testMessage = { message: 'Test message from microservice A to microservice B' };
    
    Promise.all([ instA.ready, instB.ready ]).then(() => {
      return instB.bindQueue({ exchange: 'microServiceA', pattern: 'create' }).then((queue) => {
        let consumed = 0;
        const debounce = _.debounce(() => {
          instA.close();
          instB.close();

          if (consumed === 1) {
            done();
          } else {
            done(new Error('More than one message received'));
          }
        }, 10);

        instB.consume(queue, (response) => {
          consumed++;
          
          instB.ack(response);
          assert.deepStrictEqual(response.content, testMessage);
          debounce();
        });
      });
    })
    .then(() => {
      assert.ok(instA.publish({ key: 'create', message: testMessage }));
    }).catch(done);
  }); 

  it('should get message with wildcard routing key', function(done) {
    const instA = messaging.create({ url: process.env.RABBIT_URL, exchange: 'microServiceA' });
    const instB = messaging.create({ url: process.env.RABBIT_URL, exchange: 'microServiceB' });
    const testMessage = { message: 'Test wildcard message from microservice A to microservice B' };
    
    Promise.all([ instA.ready, instB.ready ]).then(() => {
      return instB.bindQueue({ exchange: 'microServiceA', pattern: 'test.*' }).then((queue) => {
        let consumed = 0;
        const debounce = _.debounce(() => {
          instA.close();
          instB.close();
          
          if (consumed === 1) {
            done();
          } else {
            done(new Error('More than one message received'));
          }
        }, 10);

        instB.consume(queue, (response) => {
          consumed++;
          
          instB.ack(response);
          assert.deepStrictEqual(response.content, testMessage);
          debounce();
        });
      });
    })
    .then(() => {
      assert.ok(instA.publish({ key: 'test.create', message: testMessage }));
    }).catch(done);
  });
});
