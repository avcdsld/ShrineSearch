var LINE_BOT_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_BOT_CHANNEL_ACCESS_TOKEN'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定する
var YAHOO_APP_ID = PropertiesService.getScriptProperties().getProperty('YAHOO_APP_ID'); // [プロジェクトのプロパティ] > [スクリプトのプロパティ] で設定する

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
    var name = features[i].Name;
    var address = features[i]['Property'].Address;
    var coordArray = features[i]['Geometry'].Coordinates.split(',');
    var shrine_lonitude = coordArray[0];
    var shrine_latitude = coordArray[1];
    shrines.push('(' + (i+1) + ') ' + name + ' ― ' + getDistanceInKilloMeters(shrine_latitude, shrine_lonitude, latitude, lonitude) + ' km (' + address + ')\n\n'
                    + '検索: ' + getGoogleSearchUrl(name + ' ' + address) + '\n\n'
                    + 'ルート: ' + getGoogleMapRouteUrl(shrine_latitude, shrine_lonitude, latitude, lonitude));
  }
  return shrines;
}

function doPost(e) {
  var json = JSON.parse(e.postData.contents);  

  var replyToken= json.events[0].replyToken;
  if (typeof replyToken === 'undefined') {
    return;
  }

  var replyMessages = ['こんにちは。近くの神社をお知らせするLINEボットです。\n\n'
                        + '位置情報を送信すると、3 km 以内の神社を、最大 5 つ探して次の情報をお伝えします。\n\n'
                        + '・神社の名前\n'
                        + '・直線距離\n'
                        + '・住所\n'
                        + '・検索 URL\n'
                        + '・ルート案内 URL\n\n'
                        + '※位置情報は、トークルーム下部の「＋」→「位置情報」から送信できます。'];
  var userMessage = json.events[0].message;  
  if ('location' == userMessage.type) {
    replyMessages = getNearShrines(userMessage.latitude, userMessage.longitude);
  }

  var messages = replyMessages.map(function (v) {
    return {'type': 'text', 'text': v};    
  });    
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
