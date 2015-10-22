function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}


var key = guid();
var serverIP = 'http://172.17.39.33:8000';
var socket = io.connect(serverIP);
socket.emit('setKey', key);

$('#QRContent').append('<img src="https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl='+serverIP+'/panel/' + key + '&choe=UTF-8" alt=""/>');