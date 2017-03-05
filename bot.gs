var LINE_BOT_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_BOT_CHANNEL_ACCESS_TOKEN'); // [�v���W�F�N�g�̃v���p�e�B] > [�X�N���v�g�̃v���p�e�B] �Őݒ肷��
var YAHOO_APP_ID = PropertiesService.getScriptProperties().getProperty('YAHOO_APP_ID'); // [�v���W�F�N�g�̃v���p�e�B] > [�X�N���v�g�̃v���p�e�B] �Őݒ肷��

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
          + '&dist=3'     // 3 km �ȓ�
          + '&gc=0424002' // �Ǝ�R�[�h: �_��
          + '&results=5'  // �ő� 5 ��
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
    shrines.push('(' + (i+1) + ') ' + name + ' �\ ' + getDistanceInKilloMeters(shrine_latitude, shrine_lonitude, latitude, lonitude) + ' km (' + address + ')\n\n'
                    + '����: ' + getGoogleSearchUrl(name + ' ' + address) + '\n\n'
                    + '���[�g: ' + getGoogleMapRouteUrl(shrine_latitude, shrine_lonitude, latitude, lonitude));
  }
  return shrines;
}

function doPost(e) {
  var json = JSON.parse(e.postData.contents);  

  var replyToken= json.events[0].replyToken;
  if (typeof replyToken === 'undefined') {
    return;
  }

  var replyMessages = ['����ɂ��́B�߂��̐_�Ђ����m�点����LINE�{�b�g�ł��B\n\n'
                        + '�ʒu���𑗐M����ƁA3 km �ȓ��̐_�Ђ��A�ő� 5 �T���Ď��̏������`�����܂��B\n\n'
                        + '�E�_�Ђ̖��O\n'
                        + '�E��������\n'
                        + '�E�Z��\n'
                        + '�E���� URL\n'
                        + '�E���[�g�ē� URL\n\n'
                        + '���ʒu���́A�g�[�N���[�������́u�{�v���u�ʒu���v���瑗�M�ł��܂��B'];
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
