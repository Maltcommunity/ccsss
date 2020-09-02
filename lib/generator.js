'use strict';

const EventEmitter = require('events').EventEmitter;
const url = require('url');

const CleanCSS = require('clean-css');
const filterCss = require('filter-css');
const oust = require('oust');
const penthouse = require('penthouse');
const request = require('request');
const uuid = require('uuid');

const logError = require('./log').logError;


function download(resourceUrl, userAgent = 'ccsss') {
    return new Promise((resolve, reject) => {
        console.log('Downloading:', resourceUrl);
        let opts = {
            url: resourceUrl,
            strictSSL: false,
            gzip: true,
            headers: {
                'User-Agent': userAgent
            }
        };
        request(opts, (err, response, body) => {
            if (err) reject(err);
            else resolve(body);
        });
    });
}

function concatCss(cssContentsAsStringsOrNot) {
    return cssContentsAsStringsOrNot.map(c => c.toString()).join(' ')
}

function fetchCss(pageUrl, userAgent) {
    return download(pageUrl, userAgent)
        .then(html => {
            if (html.toLowerCase().indexOf('<html') === -1) {
                throw new Error('No HTML received');
            }
            return oust(html, 'stylesheets');
        })
        .then(cssLinks => {
            const urls = cssLinks.map(l => url.resolve(pageUrl, l));
            console.log('Found CSS URLs:', urls);
            return urls;
        })
        .then(cssLinks => Promise.all(cssLinks.map(c => download(c, userAgent))))
        .then(concatCss)
}

function combineCss(cssContents) {
    return new CleanCSS({mediaMerging: true})
        .minify(concatCss(cssContents))
        .styles;
}

function toRegExpArray(regExpsAsStrings) {
    return (regExpsAsStrings || []).map(re => new RegExp(re));
}

function cssFilterFor(cfg) {
    const filters = (cfg.ignore || []).concat(toRegExpArray(cfg.ignoreRe));
    return css => filters.length ?
        new CleanCSS().minify(filterCss(css, filters)).styles :
        css;
}

function callPenthouse(cfg, cssString, dimensions) {
    const forceInclude = (cfg.forceInclude || []).concat(toRegExpArray(cfg.forceIncludeRe));

    return new Promise((resolve, reject) => {
        penthouse({
            url: cfg.url,
            cssString: cssString,
            userAgent: cfg.userAgent,
            forceInclude: forceInclude,
            maxEmbeddedBase64Length: cfg.maxImageFileSize || 10240,
            width: dimensions.width,
            height: dimensions.height,
            phantomJsOptions: cfg.phantomJsOptions,
 	    timeout: 60000
        }, (err, criticalCss) => {
            if (err) reject(err);
            else resolve(criticalCss);
        });
    });
}

function generateCriticalCss(cfg) {
    return fetchCss(cfg.url, cfg.userAgent)
        .then(cssString => {
            if (!cssString) {
                console.log(`No CSS fetched`);
                // no need to call Penthouse
                return [];
            }
            const promisesForEachDimension = cfg.dimensions.map(dim => callPenthouse(cfg, cssString, dim));
            return Promise.all(promisesForEachDimension);
        })
        .then(combineCss)
        .then(cssFilterFor(cfg))
}


class CriticalCssGenerator extends EventEmitter {
    constructor() {
        super();
        this.requestsQueue = [];
        this.processing = false;
    }

    enqueue(generationRequest) {
        const generationId = uuid.v4();
        generationRequest.generationId = generationId;
        this.requestsQueue.push(generationRequest);

        if (!this.processing) {
            setTimeout(this._processNextRequest.bind(this), 1);
        }

        return generationId;
    }

    _processNextRequest() {
        if (this.processing) {
            return;
        }

        this.processing = true;

        try {
            this._unsafeProcessNextRequest()
                .then(() => {
                    this._endProcessing();
                }, err => {
                    logError(err);
                    this._endProcessing();
                });
        } catch (e) {
            logError(e);
            this._endProcessing();
        }
    }

    _unsafeProcessNextRequest() {
        const cfg = this.requestsQueue.shift();
        return generateCriticalCss(cfg)
            .then(criticalCss => this.emit('critical-css-generated', cfg, criticalCss));
    }

    _endProcessing() {
        this.processing = false;
        if (this.requestsQueue.length) {
            setTimeout(this._processNextRequest.bind(this), 1);
        }
    }
}

module.exports = CriticalCssGenerator;
