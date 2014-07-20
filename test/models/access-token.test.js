"use strict";

var sira = require('sira');
var _ = require('lodash');
var assert = require('assert');
var request = require('supertest');
var s = require('../support');
var t = s.t;
var SEC = require('../../').security;
var tokenMiddleware = require('sira-connect-token');

describe('token(options)', function () {
    beforeEach(setupWithTestToken());

    it('should populate req.token from the query string', function (done) {
        createTestAppAndRequest(this.sapp, this.token, done)
            .get('/?access_token=' + this.token.id)
            .expect(200)
            .end(done);
    });

    it('should populate req.token from an authorization header', function (done) {
        createTestAppAndRequest(this.sapp, this.token, done)
            .get('/')
            .set('authorization', this.token.id)
            .expect(200)
            .end(done);
    });

    it('should populate req.token from an X-Access-Token header', function (done) {
        createTestAppAndRequest(this.sapp, this.token, done)
            .get('/')
            .set('X-Access-Token', this.token.id)
            .expect(200)
            .end(done);
    });

    it('should populate req.token from an authorization header with bearer token', function (done) {
        var token = this.token.id;
        token = 'Bearer ' + new Buffer(token).toString('base64');
        createTestAppAndRequest(this.sapp, this.token, done)
            .get('/')
            .set('authorization', token)
            .expect(200)
            .end(done);
    });

    it('should populate req.token from a secure cookie', function (done) {
        var app = createTestApp(this.sapp, this.token, done);

        request(app)
            .get('/token')
            .end(function (err, res) {
                request(app)
                    .get('/')
                    .set('Cookie', res.header['set-cookie'])
                    .end(done);
            });
    });

    it('should populate req.token from a header or a secure cookie', function (done) {
        var app = createTestApp(this.sapp, this.token, done);
        var id = this.token.id;
        request(app)
            .get('/token')
            .end(function (err, res) {
                request(app)
                    .get('/')
                    .set('authorization', id)
                    .set('Cookie', res.header['set-cookie'])
                    .end(done);
            });
    });

    it('should skip when req.token is already present', function (done) {
        var sapp = this.sapp;
        var app = express();
        var tokenStub = { id: 'stub id' };
        app.use(function (req, res, next) {
            req.accessToken = tokenStub;
            next();
        });
        app.use(tokenMiddleware({ model: sapp.models.AccessToken }));
        app.get('/', function (req, res, next) {
            res.send(req.accessToken);
        });

        request(app).get('/')
            .set('Authorization', this.token.id)
            .expect(200)
            .end(function (err, res) {
                if (err) return done(err);
                t.deepEqual(res.body, tokenStub);
                done();
            });
    });
});


describe('AccessToken', function () {
    beforeEach(setupWithTestToken());

    it('should auto-generate id', function () {
        assert(this.token.id);
        assert.equal(this.token.id.length, 64);
    });

    it('should auto-generate created date', function () {
        assert(this.token.created);
        assert(Object.prototype.toString.call(this.token.created), '[object Date]');
    });

    it('should be validateable', function (done) {
        this.token.validate(function (err, isValid) {
            assert(isValid);
            done();
        });
    });
});


describe('authorize/direct', function () {
    this.timeout(0);

    it('prevents remote call with 401 status on denied ACL', function (done) {
        setupWithTestToken().call(this, function (err) {
            if (err) return done(err);
            sira.rekuest('test.deleteById', {id: 123})
                .prop('accessToken', this.token)
                .send(this.sapp, function (err) {
                    t.equal(err.statusCode, 401);
                    done();
                });
        });
    });

    it('prevent remote call with app setting status on denied ACL', function (done) {
        setupWithTestToken({app: {aclErrorStatus: 403}}).call(this, function (err) {
            if (err) return done(err);
            sira.rekuest('test.deleteById', {id: 123})
                .prop('accessToken', this.token)
                .send(this.sapp, function (err) {
                    t.equal(err.statusCode, 403);
                    done();
                });
        });
    });

    it('prevent remote call with model setting status on denied ACL', function (done) {
        setupWithTestToken({model: {aclErrorStatus: 404}}).call(this, function (err) {
            if (err) return done(err);
            sira.rekuest('test.deleteById', {id: 123})
                .prop('accessToken', this.token)
                .send(this.sapp, function (err) {
                    t.equal(err.statusCode, 404);
                    done();
                });
        });
    });

    it('prevent remote call if the accessToken is missing and required', function (done) {
        setupWithTestToken().call(this, function (err) {
            if (err) return done(err);
            sira.rekuest('test.deleteById', {id: 123})
                .send(this.sapp, function (err) {
                    t.equal(err.statusCode, 401);
                    done();
                });
        });
    });

});

describe.skip('authorize/rest', function () {
    this.timeout(0);

    beforeEach(setupWithTestToken());

    it('prevents remote call with 401 status on denied ACL', function (done) {
        createTestAppAndRequest(this.sapp, this.token, done)
            .del('/tests/123')
            .expect(401)
            .set('authorization', this.token.id)
            .end(done);
    });

    it('prevent remote call with app setting status on denied ACL', function (done) {
        createTestAppAndRequest(this.sapp, this.token, {aclErrorStatus: 403}, done)
            .del('/tests/123')
            .expect(403)
            .set('authorization', this.token.id)
            .end(done);
    });

    it.skip('prevent remote call with app setting status on denied ACL', function (done) {
        createTestAppAndRequest(this.sapp, this.token, {model: {aclErrorStatus: 404}}, done)
            .del('/tests/123')
            .expect(404)
            .set('authorization', this.token.id)
            .end(done);
    });

    it('prevent remote call if the accessToken is missing and required', function (done) {
        createTestAppAndRequest(this.sapp, null, done)
            .del('/tests/123')
            .expect(401)
            .set('authorization', null)
            .end(done);
    });

});


function createTestAppAndRequest(sapp, token, settings, done) {
    var app = createTestApp(sapp, token, settings, done);
    return request(app);
}

var express = require('express');
var cookieParser = require('cookie-parser');


function createTestApp(sapp, token, settings, done) {
    if (typeof settings === 'function') {
        done = settings;
        settings = null;
    }
    settings = settings || {};

    var app = express();

    app.use(cookieParser('secret'));
    app.use(tokenMiddleware({resolver: sapp.model('AccessToken')}));
    app.get('/token', function (req, res) {
        res.cookie('authorization', token.id, {signed: true});
        res.end();
    });
    app.get('/', function (req, res) {
        try {
            assert(req.accessToken, 'req should have accessToken');
            assert(req.accessToken.id === token.id);
        } catch (e) {
            return done(e);
        }
        res.send('ok');
    });

    Object.keys(settings).forEach(function (key) {
        app.set(key, settings[key]);
    });

    return app;
}

function setupWithTestToken(settings) {
    settings = settings || {};

    return function (done) {
        var self = this;

        createSapp(settings, function (err, sapp) {
            self.sapp = sapp;
            createTestToken(sapp, function (err, token) {
                if (err) return done.call(self, err);
                self.token = token;
                done.call(self);
            });
        });
    }
}

function createTestToken(sapp, cb) {
    sapp.models.AccessToken.create({}, cb);
}


function createSapp(settings, done) {
    if (typeof settings === 'function') {
        done = settings;
        settings = null
    }
    settings = settings || {};

    var modelOptions = {acls: [
        {
            principalType: "ROLE",
            principalId: "$everyone",
            accessType: SEC.ALL,
            permission: SEC.DENY,
            property: 'removeById'
        }
    ]};
    _.assign(modelOptions, settings.model);

    var appOptions = {
        beforeBoot: function (sapp) {
            sapp.registry.define('test', {
                settings: modelOptions
            }, function (test) {
                sira.expose.model(test);
            });
        }
    };
    _.assign(appOptions, settings.app);

    s.bootAppSync(appOptions, done);
}