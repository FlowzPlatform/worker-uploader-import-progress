
if [ "$TRAVIS_BRANCH" = "master" ]
then
    {
    echo "call $TRAVIS_BRANCH branch"
    ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_MASTER":"$RANCHER_SECRETKEY_MASTER"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_MASTER/v2-beta/projects?name=Production" | jq '.data[].id' | tr -d '"'`
    echo $ENV_ID
    USERNAME="$DOCKER_USERNAME_FLOWZ";
    TAG="latest";
    MONGO_URL="$MONGO_URL_MASTER";
    ESHOST="$ESHOST_MASTER";
    ESPORT="$ESPORT_MASTER";
    ESAUTH="$ESAUTH_MASTER";
    RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_MASTER";
    RANCHER_SECRETKEY="$RANCHER_SECRETKEY_MASTER";
    RANCHER_URL="$RANCHER_URL_MASTER";
    PDMINDEX="$PDM_INDEX_MASTER";
    SERVICE_NAME="$SERVICE_NAME_MASTER";
    BACKEND_HOST="$BACKEND_HOST_MASTER";
    RDB_HOST="$RDB_HOST_MASTER";
    RDB_PORT="$RDB_PORT_MASTER";
  }
elif [ "$TRAVIS_BRANCH" = "develop" ]
then
    {
      echo "call $TRAVIS_BRANCH branch"
      ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_DEVELOP":"$RANCHER_SECRETKEY_DEVELOP"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_DEVELOP/v2-beta/projects?name=Develop" | jq '.data[].id' | tr -d '"'`
      echo $ENV_ID
      USERNAME="$DOCKER_USERNAME";
      TAG="dev";
      MONGO_URL="$MONGO_URL_DEVELOP";
      ESHOST="$ESHOST_DEVELOP";
      ESPORT="$ESPORT_DEVELOP";
      ESAUTH="$ESAUTH_DEVELOP";
      RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_DEVELOP";
      RANCHER_SECRETKEY="$RANCHER_SECRETKEY_DEVELOP";
      RANCHER_URL="$RANCHER_URL_DEVELOP";
      PDMINDEX="$PDM_INDEX_DEVELOP";
      SERVICE_NAME="$SERVICE_NAME_DEVELOP";
      BACKEND_HOST="$BACKEND_HOST_DEVELOP";
      RDB_HOST="$RDB_HOST_DEVELOP";
      RDB_PORT="$RDB_PORT_DEVELOP";
  }
elif [ "$TRAVIS_BRANCH" = "staging" ]
then
    {
      echo "call $TRAVIS_BRANCH branch"
      ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_STAGING":"$RANCHER_SECRETKEY_STAGING"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_STAGING/v2-beta/projects?name=Staging" | jq '.data[].id' | tr -d '"'`
      echo $ENV_ID
      USERNAME="$DOCKER_USERNAME";
      TAG="staging";
      MONGO_URL="$MONGO_URL_STAGING";
      ESHOST="$ESHOST_STAGING";
      ESPORT="$ESPORT_STAGING";
      ESAUTH="$ESAUTH_STAGING";
      RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_STAGING";
      RANCHER_SECRETKEY="$RANCHER_SECRETKEY_STAGING";
      RANCHER_URL="$RANCHER_URL_STAGING";
      PDMINDEX="$PDM_INDEX_STAGING";
      SERVICE_NAME="$SERVICE_NAME_STAGING";
      BACKEND_HOST="$BACKEND_HOST_STAGING";
      RDB_HOST="$RDB_HOST_STAGING";
      RDB_PORT="$RDB_PORT_STAGING";
  }
else
  {
      echo "call $TRAVIS_BRANCH branch"
      ENV_ID=`curl -u ""$RANCHER_ACCESSKEY_QA":"$RANCHER_SECRETKEY_QA"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL_QA/v2-beta/projects?name=Develop" | jq '.data[].id' | tr -d '"'`
      echo $ENV_ID
      USERNAME="$DOCKER_USERNAME";
      TAG="qa";
      MONGO_URL="$MONGO_URL_QA";
      ESHOST="$ESHOST_QA";
      ESPORT="$ESPORT_QA";
      ESAUTH="$ESAUTH_QA";
      RANCHER_ACCESSKEY="$RANCHER_ACCESSKEY_QA";
      RANCHER_SECRETKEY="$RANCHER_SECRETKEY_QA";
      RANCHER_URL="$RANCHER_URL_QA";
      PDMINDEX="$PDM_INDEX_QA";
      SERVICE_NAME="$SERVICE_NAME_QA";
      BACKEND_HOST="$BACKEND_HOST_QA";
      RDB_HOST="$RDB_HOST_QA";
      RDB_PORT="$RDB_PORT_QA";
  }
fi

SERVICE_ID=`curl -u ""$RANCHER_ACCESSKEY":"$RANCHER_SECRETKEY"" -X GET -H 'Accept: application/json' -H 'Content-Type: application/json' "$RANCHER_URL/v2-beta/projects/$ENV_ID/services?name=$SERVICE_NAME" | jq '.data[].id' | tr -d '"'`
echo $SERVICE_ID

curl -u ""$RANCHER_ACCESSKEY":"$RANCHER_SECRETKEY"" \
-X POST \
-H 'Accept: application/json' \
-H 'Content-Type: application/json' \
-d '{
     "inServiceStrategy":{"launchConfig": {"imageUuid":"docker:'$USERNAME'/worker_uploader_import_progress:'$TAG'","kind": "container","labels":{"io.rancher.container.pull_image": "always","io.rancher.scheduler.affinity:host_label": "'"$BACKEND_HOST"'"},"environment": {"rdbHost": "'"$RDB_HOST"'","rdbPort": "'"$RDB_HOST"'","mongoURL":"'"$MONGO_URL"'","esHost":"'"$ESHOST"'","esPort":"'"$ESPORT"'","esAuth":"'"$ESAUTH"'","pdmIndex":"'"$PDMINDEX"'"}}},"toServiceStrategy":null}' \
$RANCHER_URL/v2-beta/projects/$ENV_ID/services/$SERVICE_ID?action=upgrade
