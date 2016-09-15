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

  it('should establish connection', () => {
    var inst = messaging.main;
    return inst.ready;
  });

  it('should publish message to exchange', () => {
    let inst = messaging.main;
    return inst.ready.then(() => {
      return inst.publish({ 
        key:     'test', 
        message: { message: 'test message' }, 
        options: { expiration: 0 }
      });
    }).then(() => inst.close());
  });

  it('should publish and receive 1 message', (done) => {
    let inst = messaging.main;
    inst.ready.then(() => {
      inst.publish({ key: 'test', message: message });
      return inst.bindQueue({ name: 'test' });
    }).then((queue) => {
      let consumed = 0;
      let debounce = _.debounce(() => {
        console.log('DEBOUNCE LA ');
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
    .catch(done);
  });


  it('should publish in another exchange', (done) => {
    var instA = messaging.create({ url: process.env.RABBIT_URL, exchange: 'testA' });
    var instB = messaging.create({ url: process.env.RABBIT_URL, exchange: 'testB' });
    
    Promise.all([ instA.ready, instB.ready ]).then(() => {
      instA.publish({ exchange: 'testB', key: 'test', message: message });
      instB.publish({ key: 'test', message: message });
      instB.bindQueue({ name: 'test' }).then((queue) => {
        instB.consume(queue, (response) => {
          console.log('µRECEVIED' , response);
          assert.deepStrictEqual(response.content, message);
          done();
        });
      }).catch(done);
    }).catch(done);
  });
});
