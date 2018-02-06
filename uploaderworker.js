const rfqQueue = require('rethinkdb-job-queue')
const extend = require('util')._extend;
const config = require('config')
let rethink = require('rethinkdb')
let mongoose = require('mongoose')
mongoose.set('debug', true)

let connctionOption = extend({}, config.get('rethinkDBConnection'))
if (process.env.rdbHost !== undefined && process.env.rdbHost !== '') {
  connctionOption.host = process.env.rdbHost
}
if (process.env.rdbPort !== undefined && process.env.rdbPort !== '') {
  connctionOption.port = process.env.rdbPort
}

let doJob = require('./uploader.js')

let mongoDBConnection = config.get('mongoDBConnection')

let mongoURL = mongoDBConnection.URL
if (process.env.mongoURL !== undefined && process.env.mongoURL !== '') {
  mongoURL = process.env.mongoURL
}

// console.log("==========", mongoURL)
// `Job` here has essentially the same API as JobCollection on Meteor.
// In fact, job-collection is built on top of the 'meteor-job' npm package!
mongoose.Promise = global.Promise
// Connect to the beerlocker MongoDB
// mongoose.connect('mongodb://localhost:3001/meteor');
mongoose.connect(mongoURL, {keepAlive: 800000, connectTimeoutMS: 800000}, function (err, db) {
  if (err) {
    console.log('error.........', err)
  }
})
// mongoose.connect('mongodb://obdev:123456@ds133311.mlab.com:33311/closeoutpromo');
let ObjSchema = mongoose.Schema

module.exports = mongoose
module.exports = ObjSchema

let queueOption = {
  name: 'uploaderJobQue'
}

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection reason:', reason);
  // application specific logging, throwing an error, or other logic here
});

const objQ = new rfqQueue(connctionOption, queueOption)

function getJobQueue () {
  objQ.process(async (job, next) => {
    try {
      // Send email using job.recipient as the destination address
      console.log('======startImportToPDM======')
      // console.log(job)
      await doJob(job, next).catch((err) => {
        console.log('===========doJob=err======', err)
      })
      console.log('======startImportToPDM=end=====')
    } catch (err) {
      return next(err)
    }
  })
}

getJobQueue()
