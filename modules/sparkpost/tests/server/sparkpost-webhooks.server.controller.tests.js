'use strict';

// test whether the daily statistics job reaches influxdb and stathat via Stats api

var should = require('should'),
    path = require('path'),
    influx = require('influx'),
    stathat = require('stathat'),
    sinon = require('sinon'),
    _ = require('lodash'),
    config = require(path.resolve('./config/config')),
    sparkpostWebhooks = require(path.resolve('./modules/sparkpost/server/controllers/sparkpost-webhooks.server.controller'));

describe('Sparkpost Webhooks - Integration Test', function () {
  // replace the influx & stathat service stat() functions with fake version
  var sandbox;

  // initializing and clearing the sinon sandbox
  beforeEach(function () {
    // sandboxing in sinon helps restore the spied/stubbed/mocked functions
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    // restore the stubbed services
    sandbox.restore();
  });

  // stub the influx and stathat endpoints
  beforeEach(function () {
    // stub the influx endpoint(s)
    sandbox.stub(influx.InfluxDB.prototype, 'writeMeasurement');

    // and writeMeasurement returns a Promise
    influx.InfluxDB.prototype.writeMeasurement.returns(
      new Promise(function (resolve) {
        process.nextTick(resolve());
      })
    );

    // provide config options for influxdb
    sandbox.stub(config.influxdb, 'options').value({
      host: 'localhost',
      port: 8086,
      protocol: 'http',
      database: 'trustroots-test'
    });

    // stub the stathat endpoints
    sandbox.stub(stathat, 'trackEZCountWithTime');
    stathat.trackEZCountWithTime.callsArgWithAsync(4, 200, null);
  });

  var testEvent = {
    msys: {
      message_event: {
        type: 'click',
        geo_ip: {
          country: 'abc'
        },
        timestamp: 1234567890,
        campaign_id: 'this is a campaign id'
      }
    }
  };

  context('influxdb configured', function () {
    beforeEach(function () {
      // stub the config.stathat.key
      // sandbox.stub(config.stathat, 'key', 'stathatkey');

      // stub enable stathat in config
      sandbox.stub(config.stathat, 'enabled').value(false);

      // stub enable influx in config
      sandbox.stub(config.influxdb, 'enabled').value(true);
    });

    it('should reach the influxdb with data in correct format', function (done) {
      sparkpostWebhooks.processAndSendMetrics(testEvent, function (e) {
        if (e) return done(e);

        try {
          // test influx endpoint
          sinon.assert.callCount(influx.InfluxDB.prototype.writeMeasurement, 1);

          var measurement = influx.InfluxDB.prototype.writeMeasurement.getCall(0).args[0];
          var points = influx.InfluxDB.prototype.writeMeasurement.getCall(0).args[1];
          should(points.length).eql(1);
          var point = points[0];

          should(measurement).eql('transactionalEmailEvent');
          should(point).have.propertyByPath('fields', 'count').eql(1);
          should(point).have.propertyByPath('fields', 'country').eql('ABC');
          should(point).have.propertyByPath('fields', 'campaignId').eql('this-is-a-campaign-id');
          should(point).have.propertyByPath('tags', 'category').eql('message_event');
          should(point).have.propertyByPath('tags', 'type').eql('click');

          should(point).have.property('timestamp', new Date(1234567890000));

          return done();
        } catch (e) {
          return done(e);
        }
      });
    });
  });

  context('stathat configured', function () {
    beforeEach(function () {
      // stub the config.stathat.key
      sandbox.stub(config.stathat, 'key').value('stathatkey');

      // stub enable stathat in config
      sandbox.stub(config.stathat, 'enabled').value(true);

      // stub enable influx in config
      sandbox.stub(config.influxdb, 'enabled').value(false);
    });

    it('should reach stathat with data in correct format', function (done) {
      sparkpostWebhooks.processAndSendMetrics(testEvent, function (e) {
        if (e) return done(e);

        try {
          // test stathat endpoint
          sinon.assert.callCount(stathat.trackEZCountWithTime, 3);

          var calledWith = _.map(_.range(3), function (n) {
            return stathat.trackEZCountWithTime.getCall(n).args;
          });

          var groupedArgs = _.zip.apply(this, calledWith);

          // the 2nd argument to the endpoint should be the name
          _.forEach([
            'transactionalEmailEvent.count',
            'transactionalEmailEvent.count.category.message_event',
            'transactionalEmailEvent.count.type.click'
          ], function (value) {
            should(groupedArgs[1]).containEql(value);
          });

          // the 3rd argument to the endpoint should be a value (values)
          should(groupedArgs[2]).deepEqual([1, 1, 1]);

          // the 4th argument to the endpoint is a timestamp in seconds
          should(groupedArgs[3]).containEql(1234567890);

          // the 5th argument is a callback function
          _.forEach(groupedArgs[4], function (arg) {
            should(arg).be.Function();
          });

          return done();
        } catch (e) {
          return done(e);
        }
      });
    });

  });

});
