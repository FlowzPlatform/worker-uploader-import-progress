const rfqQueue = require('rethinkdb-job-queue')
const extend = require('util')._extend;
const config = require('config')
let rethink = require('rethinkdb')

let connctionOption = extend({}, config.get('rethinkDBConnection'))
if (process.env.rdbHost !== undefined && process.env.rdbHost !== '') {
  connctionOption.host = process.env.rdbHost
}
if (process.env.rdbPort !== undefined && process.env.rdbPort !== '') {
  connctionOption.port = process.env.rdbPort
}

let doJob = require('./uploader.js')

let queueOption = {
  name: 'uploaderJobQue'
}

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection reason:', reason, p);
  // application specific logging, throwing an error, or other logic here
});

const objQ = new rfqQueue(connctionOption, queueOption)

objQ.on('error', (err) => {
  console.log('Queue Id: ' + err.queueId)
  console.error(err)
})


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
