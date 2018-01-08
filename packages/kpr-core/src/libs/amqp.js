const amqp = require('amqplib');
const logging = require('./logging');


/**
 * Generate a promise to check if the amqp server is available.
 *
 * @param      {Object}  arg1                                 The configuration
 * @param      {Object}  arg1.amqp:{url, timeout, heartbeat}  The amqp url timeout heartbeat
 * @param      {number}  start                                The start
 * @return     {Promise}  is the amqp server available ?
 */
const amqpReady = ({ amqp: { url, timeout, heartbeat }, log }, start) =>
  async () => {
    let connection;
    while (true) {
      try {
        connection = await amqp.connect(url, { heartbeat }); // eslint-disable-line no-await-in-loop
      } catch (err) { log.debug({ topic: 'IDC' }, err); }
      if (connection) { return connection; }
      if (new Date() - start >= timeout) { throw new Error('AMQP Server not availables'); }
    }
  };

const Module = configuration => new Promise(async (masterRes) => {
  const log = await logging.log(configuration);
  const conf = Object.assign({}, configuration, { log });

  let connectionChannel;

  masterRes({
    connection: async () => {
      const amqpConn = await amqpReady(conf, new Date());
      connectionChannel = await amqpConn.createChannel();
      process.once('SIGINT', () => {
        connectionChannel.close();
        amqpConn.close();
      });
      return connectionChannel;
    },
    assertQueue: async ({ channel, name, opts = {} }) => {
      await channel.assertQueue(name, opts.queue);
      log.debug({ topic: 'AMQP Queue', queue: name }, 'asserted');
      return {
        consume: ({ callback, options }) => {
          const LOG_TOPIC = 'AMQP Consume';
          log.debug({ topic: LOG_TOPIC, queue: name }, 'Listening');
          return channel.consume(name, message => {
            let messageParsed;
            try {
              messageParsed = JSON.parse(message.content.toString());
            } catch (error) {
              if (message.fields && message.fields.redelivered) {
                log.error(error, {
                  message,
                  messageParsed,
                  topic: LOG_TOPIC,
                });
                channel.ack(message);
              } else {
                log.warn(error, {
                  message,
                  messageParsed,
                  topic: LOG_TOPIC,
                }, 'Message failed retrying…');
                channel.nack(message);
              }
            }
            log.debug({ topic: LOG_TOPIC, messageParsed }, 'Message Received');
            return callback(messageParsed);
          }, options);
        },
        publish: ({ exchange = '', message, options }) => {
          const LOG_TOPIC = 'AMQP Publish';
          log.debug({ topic: LOG_TOPIC, message }, 'Message Sent');
          return connectionChannel.publish(exchange, name, Buffer.from(JSON.stringify(message), options));
        },
      };
    },
  });
});

module.exports.amqp = Module;
module.exports.amqpReady = amqpReady;
