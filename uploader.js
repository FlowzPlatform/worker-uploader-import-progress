let mongoose = require('mongoose')
const extend = require('util')._extend;
mongoose.set('debug', true);
let ObjectId = require('mongoose').Types.ObjectId
const config = require('config')

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
mongoose.connect(mongoURL, {autoReconnect : true, bufferMaxEntries: 0, reconnectInterval: 1000, poolSize: 5, reconnectTries: 30, keepAlive: 800000, connectTimeoutMS: 800000}, function (err, db) {
  if (err) {
    console.log('error.........', err)
  }
})
// mongoose.connect('mongodb://obdev:123456@ds133311.mlab.com:33311/closeoutpromo');
let ObjSchema = mongoose.Schema



let elasticsearch = require('elasticsearch')
let rpRequest = require('request-promise')
let http = require('http')
let _ = require('underscore')
let https = require('https')
const uuidV1 = require('uuid/v1');
let ESuserData = null
let Promise = require('es6-promise').Promise

let rethink = require('rethinkdb')
let rethinkDBConnection = extend({}, config.get('rethinkDBConnection'))
if (process.env.rdbHost !== undefined && process.env.rdbHost !== '') {
  rethinkDBConnection.host = process.env.rdbHost
}
if (process.env.rdbPort !== undefined && process.env.rdbPort !== '') {
  rethinkDBConnection.port = process.env.rdbPort
}

let pdmIndex = 'pdm1'
if (process.env.pdmIndex !== undefined && process.env.pdmIndex !== '') {
  pdmIndex = process.env.pdmIndex
}

let attributeKeys = ['attr_colors','attr_imprint_color', 'attr_shape', 'attr_decimal']
let featureKeys = ['feature_1','feature_2','feature_3','feature_4','feature_5','feature_6','feature_7','feature_8','feature_9','feature_10','feature_11','feature_12','feature_13','feature_14','feature_15','feature_16','feature_17','feature_18','feature_19','feature_20','feature_21','feature_22','feature_23','feature_24','feature_25','feature_26','feature_27','feature_28','feature_29','feature_30','feature_31','feature_32','feature_33','feature_34']

let ESConnection = extend({}, config.get('ESConnection'))
if (process.env.esHost !== undefined && process.env.esHost !== '') {
  ESConnection.host = process.env.esHost
}
if (process.env.esPort !== undefined && process.env.esPort !== '') {
  ESConnection.port = process.env.esPort
}
if (process.env.esAuth !== undefined && process.env.esAuth !== '') {
  ESConnection.auth = process.env.esAuth
}

// let esUrl = 'http://elastic:changeme@localhost:9200/'
let esUrl = 'https://' + ESConnection.auth + '@' + ESConnection.host + ':' + ESConnection.port
let collectionPrefix = 'uploader'
let activeSummary = []

let ESClient = new elasticsearch.Client({
  host: esUrl,
  requestTimeout: 100000
 // ,log: 'trace'
})
let uploadedRecord = 0

let optionsES = {
  tls: 'https://',
  host: ESConnection.host,
  path: '_xpack/security/user/',
  port: ESConnection.port,
  auth: ESConnection.auth
  // This is the only line that is new. `headers` is an object with the headers to request
  // headers: {'custom': 'Custom Header Demo works'}
}

let fileTypes =
  [ { id: 'ProductInformation', name: 'Product Information', isDone: false, isActive: true, 'esKey': ''}, // header: ProductInformationHeaders, collection: CollProductInformation },
    { id: 'ProductPrice', name: 'Product Pricing', isDone: false, isActive: false, 'esKey': 'pricing' }, // header: ProductPriceHeaders, collection: CollProductPrice },
    { id: 'ProductImprintData', name: 'Imprint Data', isDone: false, isActive: false, 'esKey': 'imprint_data' }, // header: ProductImprintDataHeaders, collection: CollProductImprintData },
    { id: 'ProductImage', name: 'Image', isDone: false, isActive: false, 'esKey': 'images' }, // header: ProductImageHeaders, collection: CollProductImage },
    { id: 'ProductShipping', name: 'Shipping', isDone: false, isActive: false, 'esKey': 'shipping' }, // header: ProductShippingHeaders, collection: CollProductShipping },
    { id: 'ProductAdditionalCharges', name: 'Additional Charges', isDone: false, isActive: false, 'esKey': 'additional_charge' }, // header: ProductAdditionalChargeHeaders, collection: CollProductAdditionalCharges },
    { id: 'ProductVariationPrice', name: 'Variation Price', isDone: false, isActive: false, 'esKey': 'pricing_variation' } // header: ProductVariationPricingHeaders, collection: CollProductVariationPrice }
  ]

let rethinkDbConnectionObj = null
let doJob = async function (objWorkJob, next) {
  finalSKU = []
  rethinkDbConnectionObj = await connectRethinkDB(rethinkDBConnection)
  return new Promise(async (resolve, reject) => {
    console.log('==============In Do Job==============')
    if (!objWorkJob.data) {
      return next(new Error('no job data'), objWorkJob)
    }
    // check user created on ES
    objWorkJob.data.userdetails.password = uuidV1()
    let userData = await getUserRequestResponse(objWorkJob)

    console.log('========get user====', userData)
    let importTrackerValue = await getImportTrackerDetails(objWorkJob)
    // console.log('==============importTrackerValue=====', importTrackerValue)
    if (importTrackerValue !== undefined) {
      objWorkJob.data = Object.assign({}, objWorkJob.data, importTrackerValue)
      // console.log('==============New objWorkJob.data=', objWorkJob.data)

      await userDataPrepared(objWorkJob)
      .then(async (result) => {
        console.log('==========userDataPrepared=result=====', result)
        await updateImportTrackerStatus(objWorkJob.data.importTrackerId)
          .then((result) => {
            next(null, 'success')
            resolve('success')
          })
          .catch((err) => {
              next(err)
           })
      })
      .catch((err) =>{
          next(err)
       })

      console.log('==============In Do Job End==============')
    }
    else {
        console.log('==============In Do Job with no data End==============')
        return next({'err': "trial"}, 'fail')
        reject("fail")
    }
    // return next(null, 'success')
  });
    // updateJobQueueStatus(objWorkJob)
}

function updateImportTrackerStatus (trackerId) {
  return new Promise(async (resolve, reject) => {
    if (uploadedRecord <=0) {
      reject({"message" :"data not uploaded, record count is zero"})
    } else {
      rethinkDbConnectionObj = await connectRethinkDB(rethinkDBConnection)
      rethink.db(rethinkDBConnection.db).table(rethinkDBConnection.table)
      .filter({'id': trackerId})
      .update({stepStatus: 'import_to_confirm'})
      .run(rethinkDbConnectionObj, function (err, cursor) {
        if (err) {
          reject(err)
        } else {
          resolve('import_to_confirm status updated')
        }
      })
    }
  })
}

function updateImportTrackerProgressStart (trackerId, totalRecord = 0, progressTotal = 0) {
  return new Promise(async (resolve, reject) => {
    rethinkDbConnectionObj = await connectRethinkDB(rethinkDBConnection)
    let updateData = {uploadProduct: progressTotal}
    if (totalRecord > 0) {
      updateData.totalProduct = totalRecord
    }
    rethink.db(rethinkDBConnection.db).table(rethinkDBConnection.table)
    .filter({'id': trackerId})
    .update(updateData)
    .run(rethinkDbConnectionObj, function (err, cursor) {
      if (err) {
        reject(err)
      } else {
        resolve('import_to_confirm status updated')
      }
    })
  })
}

async function getImportTrackerDetails (objWorkJob) {
  // make http request for user exist or not
  // makeHttpRequest(options, getUserRequestResponse, objWorkJob)
  return new Promise(async (resolve, reject) => {
    try {
      // console.log("===========getImportTrackerDetails============1", rethinkDBConnection)
      rethinkDbConnectionObj = await connectRethinkDB(rethinkDBConnection)
      // console.log("===========rethink conn obj created============",objWorkJob.data)
      let importData = await findImportTrackerData(rethinkDbConnectionObj, rethinkDBConnection.db, rethinkDBConnection.table, objWorkJob.data.importTrackerId)
      // console.log("===========treaker Data============", importData)
      resolve(importData)
    } catch (err) {
      console.log("========getImportTrackerDetails=",err)
      reject(null)
    }
  })
}

async function findImportTrackerData (rconnObj, rdb, rtable, findVal) {
  return new Promise(async (resolve, reject) => {
    console.log('================findVal=========', findVal)
    rethink.db(rdb).table(rtable)
    .filter({'id': findVal})
    .run(rconnObj, function (err, cursor) {
      if (err) {
        reject(err)
      } else {
        cursor.toArray(function(err, result) {
            if (err) {
              reject(err)
            } else {
              resolve(result[0]);
            }
        });
        // resolve(JSON.stringify(result, null, 2))
      }
    })
  })
}

async function findVirtualShopData (rconnObj, rdb, rtable, username, userObj) {
  return new Promise(async (resolve, reject) => {
    console.log('================findVal=========', username)
    rethink.db(rdb).table(rtable)
    .filter({'esUser': username,'userType': 'supplier'})
    .run(rconnObj, function (err, cursor) {
      if (err) {
        reject(err)
      } else {
        cursor.toArray(function (err, result) {
          if (err) {
            reject(err)
          } else {
            if (result.length <= 0) {
              let vshopUserObject = {
                "esUser": username,
                "password": userObj.password,
                "status": 'completed',
                "userType": 'supplier',
                "userId": username,
                "virtualShopName": userObj.full_name,
                "company": userObj.metadata.company
              }
              rethink.db(rdb)
                .table(rtable)
                .insert(vshopUserObject)
                .run(rconnObj)
              resolve(true)
            } else {
                resolve(false)
            }

          }
        })
        // resolve(JSON.stringify(result, null, 2))
      }
    })
  })
}

async function connectRethinkDB (cxnOptions) {
  return new Promise((resolve, reject) => {
    console.log("connction object", cxnOptions)
    rethink.connect(cxnOptions, async function (err, conn) {
      if (err) {
        console.log("connection error", err)
        let conn1 = await connectRethinkDB(cxnOptions)
        resolve(conn1)
      } else {
        resolve(conn)
      }
    })
  })
}

async function getESUser (username) {
  // make http request for user exist or not
  // makeHttpRequest(options, getUserRequestResponse, objWorkJob)
  return await makeHttpSRequest(username)
}

let getUserRequestResponse = async function (objWorkJob) {
  let jobData = objWorkJob.data
  let username = jobData.userdetails.id
  console.log('*********username*********', username)
  let userData = await getESUser(username)
  if (userData && Object.keys(userData).length > 0) {
    // User Exists
    ESuserData = JSON.parse(userData)
    let PreviewUserData = await makeNewPreviewUser(objWorkJob)
    let userObject = {
      'password': jobData.userdetails.password !== '' && jobData.userdetails.password !== undefined ? jobData.userdetails.password : '123456',
      'full_name': jobData.userdetails.fullname !== '' && jobData.userdetails.fullname !== undefined ? jobData.userdetails.fullname : 'Supplier',
      'metadata': {
        'company': jobData.userdetails.company !== '' && jobData.userdetails.company !== undefined ? jobData.userdetails.company : ''
      }
    }
    rethinkDbConnectionObj = await connectRethinkDB(rethinkDBConnection)
    let isUserNotExist = await findVirtualShopData(rethinkDbConnectionObj, rethinkDBConnection.vshopdb, rethinkDBConnection.vshoptable, username, userObject)
    if(isUserNotExist) {
      let userObject = {
        'password': jobData.userdetails.password !== '' && jobData.userdetails.password !== undefined ? jobData.userdetails.password : '123456',
        }
      await makeHttpsPostPasswordUpdateRequest(username, userObject)
    }
    return ESuserData
  } else {
    // make new user with version
    let userData = await makeNewUser(objWorkJob)
    let PreviewUserData = await makeNewPreviewUser(objWorkJob)
    return userData
  }
}

async function makeNewUser (objWorkJob) {
  let jobData = objWorkJob.data
  let username = jobData.userdetails.id
  console.log('username....', username)
  let userObject = {
    'password': jobData.userdetails.password !== '' && jobData.userdetails.password !== undefined ? jobData.userdetails.password : '123456',
    'roles': ['read'],
    'full_name': jobData.userdetails.fullname !== '' && jobData.userdetails.fullname !== undefined ? jobData.userdetails.fullname : 'Supplier',
    'email': jobData.userdetails.email !== '' && jobData.userdetails.email !== undefined ? jobData.userdetails.email : '',
    'metadata': {
      'id': username,
      'type': 'supplier',
      'company': jobData.userdetails.company !== '' && jobData.userdetails.company !== undefined ? jobData.userdetails.company : ''
    },
    'enabled': true
  }

  await makeHttpsPostRequest(username, userObject)

  let userData = await getESUser(username)
  console.log('==await response==', userData)
  if (userData && Object.keys(userData).length > 0) {
    // User Exists
    // console.log('User Exists', objWorkJob)
    ESuserData = JSON.parse(userData)
    rethinkDbConnectionObj = await connectRethinkDB(rethinkDBConnection)
    await findVirtualShopData(rethinkDbConnectionObj, rethinkDBConnection.vshopdb, rethinkDBConnection.vshoptable, username, userObject)
    return ESuserData
  }
}

async function makeNewPreviewUser (objWorkJob) {
  let jobData = objWorkJob.data
  let username = jobData.userdetails.id + '_demo'

  let userObject = {
    'password': jobData.userdetails.password !== '' && jobData.userdetails.password !== undefined ? jobData.userdetails.password : '123456',
    'roles': ['read_write'],
    'full_name': jobData.userdetails.fullname!=='' && jobData.userdetails.fullname!==undefined?jobData.userdetails.fullname:'Supplier',
    'email': jobData.userdetails.email!=='' && jobData.userdetails.email!==undefined?jobData.userdetails.email:'',
    'metadata': {
      'id': username,
      'type': 'supplier',
      'company': jobData.userdetails.company!=='' && jobData.userdetails.company!==undefined?jobData.userdetails.company:'',
      'sid':getUserNewVersion(ESuserData[jobData.userdetails.id])
    },
    'enabled': true
  }


   makeHttpsPostRequest(username, userObject)

  // let userData = await getESUser(username)
  // console.log('==await response==', userData)
  // if (userData && Object.keys(userData).length > 0) {
  //   // User Exists
  //   // console.log('User Exists', objWorkJob)
  //   // ESuserData = JSON.parse(userData)
  //   return ESuserData
  // }
}


function getUserDataFromMongo(userid) {
  let ObjMain = new ObjSchema({_id: 'string'}, {strict: false,bufferCommands: false, 'collection': 'users'})
  let modelOBUsers
  let modelName = 'mdlUsers'
  if (mongoose.models && mongoose.models[modelName]){
    modelOBUsers = mongoose.models[modelName]
  } else {
    modelOBUsers = mongoose.models[modelName] = mongoose.model(modelName, ObjMain)
  }
  let userDataa =  modelOBUsers.find({'_id': userid})
  return userDataa
}
let finalSKU = []
async function userDataPrepared (objWorkJob) {
  //console.log('ESuserData', ESuserData)
  // user data not set throws exception user not exists
  return new Promise(async (resolve, reject) => {
    if (!ESuserData) {
      // throws exception
    } else {
      //console.log(ESuserData)
      // make product wise json object for one product document
      let listObjects = await gatherAllData(objWorkJob)
      // console.log("*********************** LIST OBJECTS",listObjects)
      let jobData = objWorkJob.data
      let currentProducts = []
      let futureProducts = []
      let makeProductUpdateJsonObj = []
      console.log("==================",objWorkJob.data.uploadType,"===============")
      if (objWorkJob.data.uploadType != 'replace') {
        currentProducts = await getCurrentProduct(ESuserData[jobData.userdetails.id]).catch(err => {
          console.log("getCurrentProduct err",err)
        })

        futureProducts = await getFutureProduct(listObjects).catch(err => {
          console.log("getFutureProduct err",err)
        })

        makeProductUpdateJsonObj = await getUpdateRecords(objWorkJob, currentProducts, futureProducts).catch(err => {
          console.log("getFutureProduct err",err)
        })

      }
      // console.log()
      await makeBatch(objWorkJob, listObjects, currentProducts, makeProductUpdateJsonObj)
      .then((result) => {
        console.log('=================================makeBatch=========result=====', result)
        resolve(result)
      })
      .catch((err) => {
        reject(err)
      })
    }
  })
}

async function getUpdateRecords (objWorkJob, currentProducts, futureProducts) {
  let uploadType = objWorkJob.data.uploadType
  let jobData = objWorkJob.data
  // console.log("Current products...................",currentProducts)

  // if(currentProducts != undefined){

  let currntSKU = (Object.keys(currentProducts))
  let commonSKU = _.intersection(currntSKU, futureProducts)

  let finalUpdateSKU = []
  if(uploadType == 'append') {
    finalUpdateSKU = currntSKU
  } else {
    finalUpdateSKU = _.difference(currntSKU, commonSKU)
  }
  let makeProductUpdateJsonObj = []
  let getUserNextVersion1 = await getUserNewVersion(ESuserData[jobData.userdetails.id])

  finalUpdateSKU.forEach(async function (value, index) {
    finalSKU.push(value)
      makeProductUpdateJsonObj.push({
        update: {
          _index: productIndex,
          _type: productDataType,
          _id: currentProducts[value]._id // data[index]._id
        }
      })
      let updatedVId = currentProducts[value]._source.vid
      updatedVId.push(getUserNextVersion1)
      updatedVId = _.uniq(updatedVId)
      makeProductUpdateJsonObj.push({'doc': {'vid': updatedVId}})
  })
  return makeProductUpdateJsonObj;
// }
}

async function getCurrentProduct (usernameObj) {
  let currentProductsData = []
  let currentProducts = []
  if(usernameObj.metadata.sid) {
    currentProductsData = await getProductDataByESData(usernameObj, '').catch(err =>{
      console.log(err)
    })
  }
  else {
    return currentProducts
  }
  //  console.log("current ProductsData.......................",currentProductsData)
  //  console.log("current ProductsData hits.......................",currentProductsData.hits)
  //  console.log("current ProductsData hits hits.......................",currentProductsData.hits.hits)
  if(currentProductsData != undefined){
  currentProductsData = currentProductsData.hits.hits
  currentProducts = []
  currentProductsData.forEach(function (val, idx) {
    currentProducts[val._source.sku] = val
  })
  return currentProducts
 }
}

async function getFutureProduct (listObjects) {
return new Promise((resolve, reject) => {
    let mainFileObj = listObjects[0]
    //console.log(mainFileObj)
    let mainFileData = makeDynamicCollectionObj(mainFileObj['indexKey'])
     mainFileData.aggregate([
      {$match : {fileID : mainFileObj.id}},
      { $group : { _id : "$sku" } }
    ], function (err, data) {
      if(err){
        console.log("getFutureproduct",err)
        reject(err)
      }
      if (!err) {
        let arrSKU = data.map(function (a) { return a._id })
        resolve(arrSKU)
      }
    })
  })
}

function gatherAllData (objWorkJob) {
  let queueData = objWorkJob.data
  // console.log(queueData)
  // object for file list
  let listObjects = []
  // prepare for file obejct set in job Data like product price ,shipping etc.
  fileTypes.forEach(function (value, index) {
    if (queueData[value.id]) {
      listObjects[index] = queueData[value.id]
      listObjects[index]['indexKey'] = value.id
      listObjects[index]['esKey'] = value.esKey
      listObjects[index]['oldFlag'] = false
    } else {
      listObjects[index] = {}
      listObjects[index]['indexKey'] = value.id
      listObjects[index]['esKey'] = value.esKey
      listObjects[index]['oldFlag'] = true
    }
  })
  // ProductSchema
  // console.log("============listObjects===========", listObjects)
  // make particular product wise json object
  return listObjects
}


let delayPromise = (delay) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // a promise that is resolved after "delay" milliseconds with the data provided
      resolve(true)
    }, delay)
  })
}

let perPageDataUpload = 100
let batchPromise = []

// to make batch for data upload
async function makeBatch (objWorkJob, listObjects, currentProductsData, makeProductUpdateJsonObj) {
  return new Promise(async (resolve, reject) => {
    console.log("============================IN MAKE BATCH============================");
    let jobData = objWorkJob.data
    let getUserNextVersion = await getUserNewVersion(ESuserData[jobData.userdetails.id])

    // console.log("=================getUserNextVersion=", getUserNextVersion)
    // delete data in ES for current version
    await deleteESData(getUserNextVersion, ESuserData[jobData.userdetails.id]).catch(err =>{
      console.log(err)
    })

    let mainFileObj = listObjects[0]
    //console.log(mainFileObj)
    let mainFileData = makeDynamicCollectionObj(mainFileObj['indexKey'])
    mainFileData.count({'fileID': mainFileObj.id,
                'sku':{$nin:finalSKU}},
      async function (err, total) {
      if (!err && total > 0) {
          //
        console.log(' total data >>>> ', total)
        uploadedRecord = 0
        updateImportTrackerProgressStart(jobData.importTrackerId, total)

        let totalBatch = 1
        if (total > perPageDataUpload) {
            totalBatch = Math.ceil(total / perPageDataUpload)
        }

        console.log('========', totalBatch)

        await dumpToES(makeProductUpdateJsonObj)
        .then((result) => {
          console.log('==========dumpToES=result=====', result)
          uploadedRecord += makeProductUpdateJsonObj.length > 0 ? makeProductUpdateJsonObj.length / 2 : 0
          // resolve(result)
        })
        .catch(err => {
          console.log(err)
          // reject(err)
        })

        let batchPromiseObj
        for (let offset = 1; offset <= totalBatch; offset++) {
            // await delayPromise(7200)
            console.log("=============offset====", offset);
            batchPromiseObj = makeJson(objWorkJob, listObjects, offset, currentProductsData, [])
                                    .catch(err => {
                                      console.log("Makebatch err", err)
                                    })
            batchPromise.push(batchPromiseObj)
            if (offset % 5 === 0) {
              let dataTimeStamp = Date.now()
              // console.log("=====start time ", dataTimeStamp)
              await batchPromiseObj
              // console.log("=====End Time ", Date.now(), "=======Tacken Time==", Date.now() - dataTimeStamp)
            }
            console.log("=============offset=end===", offset)
            // console.log('===============', batchPromiseObj)
        }
        // mergeOtherProductData(objWorkJob, data, listObjects)

        batchPromiseObj.then((result) => {
          console.log("===========================batchPromiseObj=result======", result)
          resolve(result)
        })
        // setAllPromiseResolved(resolve, reject, batchPromise)
      } else {
        console.log(' total record zero data >>>> ', total)
        reject('Total Number of record is 0, So data will not process')
      }
    })
  })
}

function setAllPromiseResolved (resolve, reject, batchPromise1) {
  let allPromise = Promise.all(batchPromise)
  .then(values => {
    console.log('===========Promise==All=Done=========', values)
    resolve("From all Batch Import Done")
  }, reason => {
    console.log("===========Promise==All=error=========", reason)
    console.log(reason)
  })
  .catch(err => console.log('Catch', err));
}

let makeJson = function (objWorkJob, listObjects, offset, currentProductsData, makeProductUpdateJsonObj) {
  return new Promise(function (resolve) {
    // paging set up
    offset = offset !== undefined && offset > 0 ? offset : 1
    let skip = perPageDataUpload * (offset - 1)
    let mainFileObj = listObjects[0]
    //console.log(mainFileObj)
      let mainFileData = makeDynamicCollectionObj(mainFileObj['indexKey'])
      mainFileData.find({'fileID': mainFileObj.id,
                  'sku': {$nin: finalSKU}}, function (err, data) {
        if (!err) {
          //
          console.log(' Main File >>>> ')
          // console.log("Data:-----------",data)
          mergeOtherProductData(objWorkJob, data, listObjects, currentProductsData, makeProductUpdateJsonObj)
          .then((result) => {
            console.log('==========mergeOtherProductData=result=====', result)
            resolve(result)
          })
          .catch((err) => {
            reject(err)
          })
        }
      }).skip(skip).limit(perPageDataUpload)
  })
}

async function mergeOtherProductData (objWorkJob, data, listObjects, currentProductsData, makeProductUpdateJsonObj) {
return new Promise(async (resolve, reject) => {
    let jobData = objWorkJob.data

    //console.log(`=================console ${data.length}`, listObjects)
    let makeProductJsonObj = makeProductUpdateJsonObj
    let activeSummaryObj
    let getUserNextVersion = await getUserNewVersion(ESuserData[jobData.userdetails.id])

    // console.log("=======getUserNextVersion=",getUserNextVersion)
    let currentProductData = []
    let idInc = 0
    for (let dataKey in data) {
      idInc++
      // data.forEach(async function (value, index) {
      let value = data[dataKey].toObject()
      // console.log("*************VALUE***********", value.sku);
      activeSummary.length = 0;
      // console.log("**************************",activeSummary,"*******************");

      if(jobData.uploadType == 'update') {
        if(currentProductsData[value.sku] == undefined) {
          continue
        }
      }
      //console.log('ID:' + data[index])
      // new ObjectId(data[index]._id)
      // console.log(query);
      //let currentProductData = await getProductDataByESData(ESuserData[jobData.userdetails.id], value.sku)
      if(currentProductsData[value.sku]) {
          currentProductData = currentProductsData[value.sku]._source
      } else {
          currentProductData = undefined
      }
      // -----file objects
     let otherValue = null
     for (let listObjectKey in listObjects) {
      if(listObjects[listObjectKey].indexKey !== 'ProductInformation') {
       value = await getProductSpecificOtherValues(listObjects[listObjectKey], value, currentProductData)
      }
     }
     // console.log("========================value.sku=", value.sku)
     makeProductJsonObj.push({
        index: {
          _index: productIndex,
          _type: productDataType,
          _id: uuidV1() + '-' + idInc // data[index]._id
        }
      })
      // delete _id form value object
      delete (value._id)
      delete (value.fileID)
      delete (value.sr_no)
      delete (value.owner)

      //console.log(value)
      // let available_regions =  value['available_regions'].toString();
      // console.log("*********************",  available_regions)
      // let available_regions_data = {}
      // available_regions_data.push(available_regions)
      // value['available_regions'] = available_regions.split(",")
      // console.log("*********************",  value['available_regions'])
       if(value['available_regions']){
         value['available_regions'] = convertStringToArray(value['available_regions'], ',')
       }
       else{
         value['available_regions'] = []
       }

       if(value['non-available_regions']){
         value['non-available_regions'] = convertStringToArray(value['non-available_regions'], ',')
       }
       else{
         value['non-available_regions'] = []
       }

       if(value['special_price_valid_up_to'] !== undefined && value['special_price_valid_up_to'] === '') {
         delete(value['special_price_valid_up_to'])
       }

      value['available_currencies'] = convertStringToArray(value['available_currencies'], '|')
      if(value['categories']) {
        value['categories'] = convertStringToArray(value['categories'], '|')
      }
      if (value['search_keyword']) {
        value['search_keyword'] = convertStringToArray(value['search_keyword'], '|')
      }
      // value['available_regions'] = convertStringToArray(value['available_regions'], ',')
      // value['nonavailable_regions'] = convertStringToArray(value['nonavailable_regions'], ',')



      attributeKeys.forEach(function (aIndex, aValue) {
        if(value[aIndex] && value[aIndex].length > 0) {
            if(!value.attributes) {
              value.attributes = {}
            }
            let keyValue = aIndex.replace('attr_', '')
            value.attributes[keyValue] = convertStringToArray(value[aIndex], '|')
            let attributes = value.attributes[keyValue].join();
            activeSummary.push(attributes);
            // console.log("ACTIVE SUMMARY.............",activeSummary);

            delete(value[aIndex])
        }
      })

       let featuresArray = [];
      featureKeys.forEach(function (fIndex, fValue) {
        // console.log("---------------findex---------------",fIndex);
        // console.log("---------------fValue---------------",fValue);
        // console.log("---------------value[fIndex]---------------",value[fIndex]);
        if(value[fIndex] && value[fIndex].length > 0) {
          if(!value.features) {
            value.features = {}
          }
          let keyValue = fIndex.replace('feature_', '')


          // let key = "key"
          // let value = "value"
          // console.log("***************************",keyValue,"**************************");
          if (value[fIndex] && value[fIndex] !== '') {
            let featuresArr = convertStringToArray(value[fIndex], '|')
            featuresArray.push({"key":featuresArr[0],"value":featuresArr[1]})
            let features = featuresArr.join();
            activeSummary.push(features);
          }
          delete(value[fIndex])
        } else {
          delete(value[fIndex])
        }
      })
      value.features = featuresArray
      // console.log("^^^^^^^^^^^^^^^^^^^^^^^value['features']^^^^^^^^^^^^^^^^^^^^^",value.features);

      value['activeSummary'] = activeSummary.join()
      // console.log("++++++++++++++++++++++++++",value['activeSummary'])

      //value['attr_colors'] = convertStringToArray(value['attr_colors'], '|')
      // console.log("---------------------------------------->",ESuserData[jobData.userdetails.id]['metadata']['company'])
      // value['supplier_id'] = ESuserData[jobData.userdetails.id]['metadata']['id']
      value['supplier_id'] = ESuserData[jobData.userdetails.id]['metadata']['id']
      value['createdAt'] = Date.now()
      value['supplier_info'] = {
                                'company': ESuserData[jobData.userdetails.id]['metadata']['company'],
                                'username': jobData.userdetails.id,
                                'supplier_name': jobData.userdetails.fullname,
                                'email': jobData.userdetails.email
                              }
      value['vid'] = Array(getUserNextVersion)

      // console.log("Active Summary in the end......",activeSummary);
      // activeSummaryObj = toObject(activeSummary);
      // activeSummaryObj =activeSummary.reduce(function(acc, cur, i) {
      //   acc[i] = cur;
      //   return acc;
      // }, {});
      // console.log("Active Summary Object.................",activeSummaryObj)
      // value['vid'] = Array('sub5-1')
//      console.log("---------------Value For ES--------",value)
      makeProductJsonObj.push(value)
      // makeProductJsonObj.push({activeSummary:activeSummaryObj})
      // console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",JSON.stringify(makeProductJsonObj))
    //  return true
    }

    //console.log(ESuserData)

    // dump data in ES
    //  await PushToES(activeSummary)
//    console.log("==========================dumpToEs==================");
    await dumpToES(makeProductJsonObj)
    .then((result) => {
      console.log('==========dumpToES=result=====', result)
      uploadedRecord += makeProductJsonObj.length > 0 ? makeProductJsonObj.length / 2 : 0
      updateImportTrackerProgressStart(jobData.importTrackerId, 0, uploadedRecord)
      resolve(result)
    })
    .catch(err => {
      console.log(err)
      reject(err)
    })

  })
}

// for (var i = 0; i < activeSummary.length; i++ ) {
//     ESClient.create({
//       index: productIndex,
//       type: productDataType,
//       body: activeSummary[i]
//     }, function(error, response){
//       if(!err){
//         console.log("active summary inserted.....");
//       }
//     });
// }

async function getProductSpecificOtherValues (fValue, value, currentVal) {
  return new Promise(async (resolve, reject) => {
    let oldValue = value
    // console.log(".............In getProductSpecificOtherValues................. ")
    let currency_key = ""
    let min_price = ""
    let max_price = ""
    if(fValue['oldFlag'] === true) {
      if(currentVal && currentVal[fValue['esKey']]) {
        if(value[fValue['esKey']]) {
            value[fValue['esKey']] = {}
        }
        value[fValue['esKey']] = currentVal[fValue['esKey']]
      }
      resolve(value)
    } else {
      let collObject = makeDynamicCollectionObj(fValue['indexKey'])
      let available_currencies = convertStringToArray(value['available_currencies'], '|')
      let baseCurrency =   available_currencies[0]
      // console.log("************* baseCurrency",baseCurrency,"****************")

      await collObject.find({'sku': value.sku, 'fileID': fValue['id']}, function (err, result) {
        if(!err) {
          if(result.length > 0) {
            let pricingArr = {}
            result.forEach(function (value, index) {
              result[index] = result[index].toObject()
              delete result[index].fileID
              delete result[index].owner
              delete result[index].username
              delete result[index].sr_no

              if(fValue['indexKey'] == 'ProductShipping'){
                result[index].shipping_range = formatShippingRange(result[index])
                // console.log("**************  result[index].shipping_range***************",result[index].shipping_range)
              }

              if(fValue['indexKey'] == 'ProductImprintData'){
                result[index].imprint_data_range = formatShippingRange(result[index])
                // console.log("**************  result[index].shipping_range***************",result[index].shipping_range)
              }

              if(fValue['indexKey'] === 'ProductImage') {
                result[index].images = formatImages(result[index])
                // console.log("###########",result[index])
              }

              if(fValue['indexKey'] === 'ProductPrice') {
                if(result[index].currency != baseCurrency){

                  currency_key = '_' + result[index].currency;

                } else {
                  currency_key = ''
                }

                  result[index].price_range = formatPriceRange(result[index])
                  // console.log("result[index]..1111........",result[index])
                  // console.log("result[index][price_type]..........",result[index]["price_type"])
                  if(result[index]["price_type"]== "regular" && (result[index]["type"]== "decorative" || result[index]["type"]== "") && result[index]["global_price_type"] == "global"){
                  min_price = result[index]["price_range"][0]["price"]

                  let price_range = result[index]["price_range"]
                  // console.log("price_range",price_range)
                  for(i=0;i<price_range.length;i++){
                    let length = price_range.length
                    // console.log("length...",length)
                    if(length > 1){
                      // console.log("called........")
                    max_price = price_range[length-1]["price"]
                    // console.log("max_price",max_price)
                    }
                  }
                }


                attributeKeys.forEach(function (aIndex, aValue) {
                  if(result[index][aIndex] && result[index][aIndex].length > 0) {
                      if(!result[index].attributes) {
                        result[index].attributes = {}
                      }
                      let keyValue = aIndex.replace('attr_', '')
                      result[index].attributes[keyValue] = convertStringToArray(result[index][aIndex], '|')
                      // let attributes =  result[index].attributes[keyValue].join();
                      // activeSummary.push(attributes);
                      // console.log("*************ACTIVE SUMMARY************",activeSummary);
                      delete(result[index][aIndex])
                  }
                })

                if(pricingArr[fValue['esKey']+currency_key] == undefined) {
                  pricingArr[fValue['esKey']+currency_key] = []
                }
                pricingArr[fValue['esKey']+currency_key].push(result[index])
              }
            })

            if(fValue['indexKey'] == 'ProductPrice') {
               // console.log("========32323333232==========================pricingArr=",pricingArr)
              value["min_price"] = min_price
              value["max_price"] = max_price
              // console.log("min_price................",value["min_price"],value["max_price"])
                for (var property in pricingArr) {
                  if (pricingArr.hasOwnProperty(property)) {
                      value[property]=pricingArr[property]
                      // console.log("value[property]",value[property])
                      // console.log("value",value) // do stuff
                  }
                }
            } else {
                value[fValue['esKey']] = result
                // console.log("value[fValue['esKey']]",value[fValue['esKey']])
            }
          }
          resolve(value)
        } else {
          resolve(oldValue)
        }
      }).catch(err => {
        console.log("getProductSpecificOtherValues err",err)
        resolve(oldValue)
      })
    }
  })
}


function formatPriceRange (result) {
  // console.log("FormatPricerange...................")
  let priceRange = []
  for(let i = 1; i <= 10; i++) {
    if(result['qty_' + i + '_min'] > 0) {
      if(result['qty_' + i + '_max'] > 0) {
        priceRange.push({'qty': {'gte': result['qty_' + i + '_min'],
          'lte': result['qty_' + i + '_max'] > 0 ? result['qty_' + i + '_max'] : 0 },
          'price': result['price_' + i],
          'code': result['code_' + i]})
        } else {
          priceRange.push({'qty': {'gte': result['qty_' + i + '_min'] },
            'price': result['price_' + i],
            'code': result['code_' + i]})
        }
        delete result['qty_' + i + '_min']
        delete result['qty_' + i + '_max']
        delete result['price_' + i]
        delete result['code_' + i]
    } else {
      delete result['qty_' + i + '_min']
      delete result['qty_' + i + '_max']
      delete result['price_' + i]
      delete result['code_' + i]
    }
  }
  return (priceRange);
}

// function minPrice (result) {
//     if(result['qty_1_min']) {
//       if(result['qty_1_max'] > 0) {
//         priceRange.push({'qty': {'gte': result['qty_' + i + '_min'],
//           'lte': result['qty_' + i + '_max'] > 0 ? result['qty_' + i + '_max'] : 0 },
//           'price': result['price_' + i],
//           'code': result['code_' + i]})
//         } else {
//           priceRange.push({'qty': {'gte': result['qty_' + i + '_min'] },
//             'price': result['price_' + i],
//             'code': result['code_' + i]})
//         }
//         delete result['qty_' + i + '_min']
//         delete result['qty_' + i + '_max']
//         delete result['price_' + i]
//         delete result['code_' + i]
//     }
//   }
//   return (priceRange);
// }

function formatShippingRange (result) {
  let shippingRange = []
  for(let i = 1; i <= 10; i++) {
    if(result['qty_' + i + '_min']) {
      if(result['qty_' + i + '_max'] > 0) {
        shippingRange.push({'qty': {'gte': result['qty_' + i + '_min'],
          'lte': result['qty_' + i + '_max'] > 0 ? result['qty_' + i + '_max'] : 0 }
          })
        } else {
          shippingRange.push({'qty': {'gte': result['qty_' + i + '_min'] },
          })
        }
        delete result['qty_' + i + '_min']
        delete result['qty_' + i + '_max']
        delete result['price_' + i]
        delete result['code_' + i]
    } else {
      delete result['qty_' + i + '_min']
      delete result['qty_' + i + '_max']
      delete result['price_' + i]
      delete result['code_' + i]
    }
  }
  return (shippingRange);
}

function formatImages (result) {
  // console.log("+++++++++++++++++++ result",result)
  let images = []
  for(let i = 1; i <= 50; i++) {
    if(result['web_image_' + i] && result['web_image_' + i] !== null && result['web_image_' + i] !== '') {
      // console.log("inside..............................................................................")
        images.push({'web_image': result['web_image_' + i],
                     'color': result['color_' + i],
                     'image_color_code': result['image_color_code_' + i],
                     'secure_url': result['secure_url_' + i]
          })
        }
        delete result['web_image_' + i]
        delete result['image_color_code_' + i]
        delete result['color_' + i]
        delete result['secure_url_' + i]
    }
  return (images)
}

function getUserNewVersion (ESUser) {
  //console.log("===========",ESUser)
  let versionNo = 1
  if (ESUser.metadata.user_version_history) {
    versionNo = ESUser.metadata.user_version_history.length + 2
  }
  return 'sup' + ESUser.metadata.id + '-' + versionNo
}

function makeDynamicCollectionObj (collectionName) {
  collectionName = collectionName.charAt(0).toUpperCase() + collectionName.slice(1).toLowerCase()
  let ObjMain = new ObjSchema({_id: 'string'}, {strict: false, bufferCommands: false, 'collection': collectionPrefix + collectionName})
  let modelName = 'mdl'+collectionName
  if (mongoose.models && mongoose.models[modelName]){
    return mongoose.models[modelName]
  } else {
    return mongoose.model('mdl'+collectionName, ObjMain)
  }
}

function makeDynamicCollectionObjWithoutPrefix (collectionName) {
  // collectionName = collectionName.charAt(0).toUpperCase() + collectionName.slice(1).toLowerCase()
  let ObjMain = new ObjSchema({_id: 'string'}, {strict: false, bufferCommands: false, 'collection': collectionName})
  let modelName = 'mdl'+collectionName
  if (mongoose.models && mongoose.models[modelName]){
    return mongoose.models[modelName]
  } else {
    return mongoose.model('mdl'+collectionName, ObjMain)
  }
}

const productIndex = pdmIndex
const productDataType = 'product'

async function deleteESData (versionNo, EsUser) {
  return new Promise(async function (resolve, reject) {
    let bodyData = {
      "query": {
          "bool": {
              "must": [
                 {"match_phrase": { "vid": versionNo }}
              ]
          }
      },
      "_source": ["sku","vid"],
      "size":10000
    }
    await ESClient.search({
    index: productIndex,
    type: productDataType,
    body: bodyData
    }, function (error, response) {
      // console.log("***************",response)
      if(response !== undefined && response.hits && response.hits.hits && response.hits.hits.length > 0) {
        let productData = response.hits.hits
        let makeProductUpdateJsonObj1 = []
        productData.forEach(function (value, index) {
          if(value._source.vid.length > 1) {
            makeProductUpdateJsonObj1.push({
              update: {
                _index: productIndex,
                _type: productDataType,
                _id: value._id // data[index]._id
              }
            })
            let updatedVId = []
            updatedVId.push(versionNo)
            updatedVId = _.difference(value._source.vid, updatedVId)
            makeProductUpdateJsonObj1.push({'doc': {'vid': updatedVId}})
          } else if(value._source.vid.length == 1) {
            makeProductUpdateJsonObj1.push({
              delete: {
                _index: productIndex,
                _type: productDataType,
                _id: value._id // data[index]._id
              }
            })
          }
        })
        if(makeProductUpdateJsonObj1.length > 0) {
          dumpToES(makeProductUpdateJsonObj1)
        }
      }
      return resolve('remove new version = ' + versionNo)
    })
  })
}

async function getProductDataByESData (EsUser, sku) {
  return new Promise(async function (resolve, reject) {
    let bodyData = {
      "query": {
          "bool": {
              "must": [
                 {"match_phrase": { "supplier_id": EsUser.metadata.id }},
                 {"match_phrase": { "vid": EsUser.metadata.sid }}
              ]
          }
      },
      "size":10000
    }
    if(sku != undefined && sku != '') {
      bodyData.query.bool.must.push( {"match_phrase": { "sku": sku }})
    }
    // console.log("======bodyData=======", bodyData.query.bool.must)
    try {
      await ESClient.search({
      index: productIndex,
      type: productDataType,
      body: bodyData
      }, function (error, response) {
        // console.log(error, response)
        resolve(response)
      })
    } catch (e) {
      // console(e)
      return reject({'hits':{'hits':[]}})
    }

  })
}

async function dumpToES (makeProductJsonObj) {
  return new Promise(function (resolve) {
    if (makeProductJsonObj.length <= 0) {
      resolve('no record to Insert')
    }
    let bulkRowsString = makeProductJsonObj.map(function (row) {
     // console.log("-------------------------",row,"----------------------------");
      return JSON.stringify(row)
    }).join('\n') + '\n'
    bulkRowsString += '\n'
    // console.log(makeProductJsonObj);
    console.log("-------------------------bulk request----------------------------");

      ESClient.bulk({body: makeProductJsonObj}, function (err, resp) {
        if (!err) {
          resolve('Inserted')
          console.log("makeProductJsonObj inserted.....")
        }
      })
  })
}


function convertStringToArray (str, seprater) {
  return str.toString().split(seprater)
}

// to update user job queue process status to import_completed
function updateJobQueueStatus (objWorkJob) {
  let objJobMaster = new ObjSchema({_id: String}, {strict: false, bufferCommands: false, 'collection': 'uploaderJobMaster'})
  let mdlobjJobMaster = null
  if (mongoose.models && mongoose.models.objJobMaster) {
    mdlobjJobMaster = mongoose.models.objJobMaster
  } else {
    mdlobjJobMaster = mongoose.model('objJobMaster', objJobMaster)
  }

  let jobData = objWorkJob.data
  //console.log("=====job data status======",jobData.id)
  let query = {'_id': jobData.id}
  let dataObj = {}
  dataObj.stepStatus = 'import_to_confirm'
  //{'$set': {'stepStatus': 'import_to_confirm'} },

    mdlobjJobMaster.findOne(query, function (err, data) {
      if (err) {
      //  console.log('===master job queue=====failed=========')
      } else {
        //data = data[0].toString()
        //data.stepStatus = 'import_to_confirm'
        let newObj = new mdlobjJobMaster(data)
        newObj.stepStatus = 'import_to_confirm'
        mdlobjJobMaster.update(data, newObj, function (err,resData) {
            //console.log('===master job queue=====succesfully saved=========')
        })
      }
    })
}



function makeHttpRequest (httpOptions, httpCallback, returnParameter) {
  let objHttpCallBack = httpCallback
  // ================================================================================
  // let options = {
  //   host: 'localhost',
  //   path: '_xpack/security/user/elastic',
  //   port: '9200',
  //   auth: 'elastic:changeme'
  //   // This is the only line that is new. `headers` is an object with the headers to request
  //   // headers: {'custom': 'Custom Header Demo works'}
  // }
  //
  let objOptions = null
  // console.log(options)
  // console.log(httpOptions)
  // extend(objOptions, httpOptions, options)
  // console.log(objOptions, httpOptions, options)

  objOptions = httpOptions

  let str = ''
  let callback = function (response) {
    response.on('data', function (chunk) {
      str += chunk
    })
    response.on('end', function () {
      // return to call back function which provide with Request
      objHttpCallBack(str, returnParameter)
    })
  }

  var req = http.request(objOptions, callback)
  req.end()
  // ================================================================================
}

async function makeHttpSRequest (username) {
  console.log("makeHttpSRequest",username)
  let objOptions = optionsES
  try {
    let response = await rpRequest( objOptions.tls + objOptions.auth + '@' + objOptions.host + ':' + objOptions.port + '/' + objOptions.path + username)
    // console.log("rpRequest...........",response)
    return response
  } catch (error) {
    return {}
  }
}

async function makeHttpsPostRequest (username, userData) {
  let objOptions = optionsES
  let reqOptions = {
    method: 'POST',
    uri: objOptions.tls + objOptions.auth + '@' + objOptions.host + ':' + objOptions.port + '/' + objOptions.path + username,
    body: userData,
    json: true
  }

  let response = await rpRequest(reqOptions)
  return response
}

async function makeHttpsPostPasswordUpdateRequest (username, userPassword) {
  let objOptions = optionsES
  let reqOptions = {
    method: 'POST',
    uri: objOptions.tls + objOptions.auth + '@' + objOptions.host + ':' + objOptions.port + '/' + objOptions.path + username+'/_password',
    body: userPassword,
    json: true
  }

  let response = await rpRequest(reqOptions)
  return response
}

module.exports = doJob
