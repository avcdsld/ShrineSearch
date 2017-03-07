var YAHOO_APP_ID = PropertiesService.getScriptProperties().getProperty('YAHOO_APP_ID'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定する
var LINE_BOT_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_BOT_CHANNEL_ACCESS_TOKEN'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定する
var GOOGLE_FUSION_TABLES_DOC_ID = PropertiesService.getScriptProperties().getProperty('GOOGLE_FUSION_TABLES_DOC_ID'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定する

var LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
var YAHOO_SEARCH_URL = 'https://map.yahooapis.jp/search/local/V1/localSearch';
var YAHOO_DIST_URL = 'https://map.yahooapis.jp/dist/V1/distance';

function getDistanceInKilloMeters(latitude1, longitude1, latitude2, longitude2) {
  var url = YAHOO_DIST_URL
          + '?appid=' + YAHOO_APP_ID
          + '&coordinates=' + longitude1 + ',' + latitude1 + encodeURIComponent(' ') + longitude2 + ',' + latitude2
          + '&output=json';
  var response = UrlFetchApp.fetch(url);
  var distance = JSON.parse(response.getContentText('UTF-8'))['Feature'][0]['Geometry'].Distance;
  return Math.round(distance * 10) / 10;
}

function getGoogleSearchUrl(query) {
  return 'https://www.google.co.jp/search?q=' + encodeURIComponent(query) + '&ie=UTF-8';
}

function getGoogleMapRouteUrl(srcLatitude, srcLongitude, destLatitude, destLongitude) {
  return 'http://maps.google.com/maps'
         + '?saddr=' + srcLatitude + ',' + srcLongitude
         + '&daddr=' + destLatitude + ',' + destLongitude
         + '&dirflg=w';
}

function changeVisited(uid, userId, visited) {
  var sql = "SELECT ROWID FROM " + GOOGLE_FUSION_TABLES_DOC_ID
          + " WHERE uid = '" + uid + "' and userId = '" + userId + "'";
  var result = FusionTables.Query.sqlGet(sql);
  if (typeof result.rows === 'undefined') {
    sql = "INSERT INTO " + GOOGLE_FUSION_TABLES_DOC_ID
        + " (uid, userId, visited)"
        + " VALUES ('" + uid + "', '" + userId + "', " + visited + ")";
    FusionTables.Query.sql(sql); 
  } else {
    var rowid = result.rows[0];
    sql = "UPDATE " + GOOGLE_FUSION_TABLES_DOC_ID
        + " SET visited = " + visited
        + " WHERE ROWID = '" + rowid + "'";
    FusionTables.Query.sql(sql);
  }
}

function isVisited(uid, userId) {
  var sql = "SELECT visited FROM " + GOOGLE_FUSION_TABLES_DOC_ID
          + " WHERE uid = '" + uid + "' and userId = '" + userId + "'";
  var result = FusionTables.Query.sqlGet(sql);
  if (typeof result.rows === 'undefined') {
    return false;
  }
  return (result.rows[0] == 1);
}

var Shrine = function(uid, name, address, distance, googleSearchUrl, googleMapRouteUrl) {
  this.uid = uid;
  this.name = name;
  this.address = address;
  this.distance = distance;
  this.googleSearchUrl = googleSearchUrl;
  this.googleMapRouteUrl = googleMapRouteUrl;
};
function getNearShrines(latitude, lonitude) {
  var url = YAHOO_SEARCH_URL
          + '?appid=' + YAHOO_APP_ID
          + '&dist=3'     // 3 km 以内
          + '&gc=0424002' // 業種コード: 神社
          + '&results=5'  // 最大 5 件
          + '&lat=' + latitude
          + '&lon=' + lonitude
          + '&output=json&sort=dist';
  var response = UrlFetchApp.fetch(url);
  
  var shrines = [];
  var features = JSON.parse(response.getContentText('UTF-8'))['Feature'];
  for (i = 0; i < features.length; i++) {
    var uid = features[i]['Property'].Uid;
    var name = features[i].Name;
    var address = features[i]['Property'].Address;
    var coords = features[i]['Geometry'].Coordinates.split(',');
    var shrine_lonitude = coords[0];
    var shrine_latitude = coords[1];
    var distance = getDistanceInKilloMeters(shrine_latitude, shrine_lonitude, latitude, lonitude);
    var googleSearchUrl = getGoogleSearchUrl(name + ' ' + address);
    var googleMapRouteUrl = getGoogleMapRouteUrl(shrine_latitude, shrine_lonitude, latitude, lonitude);
    shrines.push(new Shrine(uid, name, address, distance, googleSearchUrl, googleMapRouteUrl));
  }
  return shrines;
}

function doPost(e) {
  var json = JSON.parse(e.postData.contents);  

  var userId = json.events[0].source.userId;

  var replyToken= json.events[0].replyToken;
  if (typeof replyToken === 'undefined') {
    return;
  }
  
  var helpMessage = 'こんにちは。近くの神社をお知らせするLINEボットです。\n\n'
                  + '位置情報を送信すると、3 km 以内の神社を、最大 5 つ探して次の情報をお伝えします。\n\n'
                  + '・神社の名前\n'
                  + '・直線距離\n'
                  + '・住所\n'
                  + '・検索リンク\n'
                  + '・ルート案内リンク\n\n'
                  + '※位置情報は、トークルーム下部の「＋」→「位置情報」から送信できます。';
  var messages = [{'type': 'text', 'text': helpMessage}]; 

  if ('message' == json.events[0].type) {
  
    var userMessage = json.events[0].message;
    if ('location' == json.events[0].message.type) {
      var replyMessage = getNearShrines(userMessage.latitude, userMessage.longitude);
      var columns = replyMessage.map(function (v) {
        var title = v.name;
        var postbackLabel = '行ったことがある';
        var postbackData = 'action=visited&uid=' + v.uid;
        if (isVisited(v.uid, userId)) {
          title += ' (★参拝済み)'
          postbackLabel = '参拝済み を取り消す';
          postbackData = 'action=unvisited&uid=' + v.uid;
        }
        return {
          'title': title,
          'text': 'ここから ' + v.distance + 'km ― ' + v.address,
          'actions': [
            {
              'type': 'postback',
              'label': postbackLabel,
              'data': postbackData
            },
            {
              'type': 'uri',
              'label': 'この神社を検索',
              'uri': v.googleSearchUrl
            },
            {
              'type': 'uri',
              'label': 'ここからのルート',
              'uri': v.googleMapRouteUrl
            }
          ]
        };
    });
    var altText = '';
    replyMessage.forEach(function(element, index, array) {
      altText += element.name + ' | ';
    });
    messages = [
      {
        'type': 'template',
        'altText': altText,
        'template': {
          'type': 'carousel',
          'columns': columns
        }
      }
    ];

  }
  
  } else if ('postback' == json.events[0].type) {
    var data = json.events[0].postback.data;
    var dataArray = data.split('&');
    var action = dataArray[0].split('=')[1];
    var uid = dataArray[1].split('=')[1];
    if ('visited' == action) {
      changeVisited(uid, userId, 1);
    } else if ('unvisited' == action) {
      changeVisited(uid, userId, 0);
    }
    messages = [{'type': 'text', 'text': '行ったことがある神社を更新しました'}]; 
  }

  UrlFetchApp.fetch(LINE_REPLY_URL, {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + LINE_BOT_CHANNEL_ACCESS_TOKEN,
    },
    'method': 'post',
    'payload': JSON.stringify({
      'replyToken': replyToken,
      'messages': messages,
    }),
  });
  return ContentService.createTextOutput(JSON.stringify({'content': 'post ok'})).setMimeType(ContentService.MimeType.JSON);
}
