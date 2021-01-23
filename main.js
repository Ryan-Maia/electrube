const { app, BrowserWindow, ipcMain, Menu, Tray, globalShortcut, clipboard, Notification } = require("electron");
const electron = require("electron");
const { ipcRenderer } = electron;
const youtubedl = require('youtube-dl');
const rimraf = require("rimraf");
const https = require("https");
const fs = require('fs');


let force_quit = null;
let tray = null;
let mainWindow = null;
let checkFirstInstance = app.requestSingleInstanceLock();
// if is the first instance = true; else = false.

//-----------------------------------------------------------//
//----------- Code that lock one instance at time -----------//
if (!checkFirstInstance) {
  app.quit();
}else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    mainWindow.show();
    mainWindow.focus();  
  });
}
//-----------------------------------------------------------//

app.whenReady().then(() => {
  if(!fs.existsSync('./imagens')){
    fs.mkdirSync('./imagens');
  }
  //----------------------------------//
  //----------- Tray Setup -----------//
  tray = new Tray('./icon.png')
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '🎞Abrir🎞', 
      click:function(){mainWindow.show();mainWindow.focus()} 
    },
    { 
      label: '❌Sair❌', 
      click:function(){force_quit = true; app.quit();} 
    }
  ]);
  tray.setToolTip('Copie o link do video e pressione alt + 5 para salvar o video')
  tray.setContextMenu(contextMenu)
  //----------------------------------//

  globalShortcut.register('Alt+numadd', () => {
    let videoUrl = clipboard.readText()
    let videoId = videoUrl.split('?v=').pop().split('&')[0];
    let file = fs.createWriteStream(`./imagens/${videoId}.jpg`)
    var request = https.get(`https://img.youtube.com/vi/${videoId}/hq1.jpg`, function(response) {
        response.pipe(file);
        downloadVideo({ "url" : videoUrl, "id" : videoId })
    });
  })

  createWindow();

  mainWindow.on('close',(e)=>{
    if(!force_quit){
      e.preventDefault();
      console.log("opa");
      mainWindow.hide();
    }
  })
})





function createWindow(){
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        frame: false,
        // maxWidth: 1000,
        // maxHeight: 600,
        webPreferences: {
            nodeIntegration: true,
        },
        
    });

    mainWindow.setMenuBarVisibility(false)
    mainWindow.loadFile(__dirname + "/src/index.html");
    /*mainWindow.on('window_closed', (e, item)=>{
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('button_enable', item);
    });*/

}

ipcMain.on('closeWindow',(e,data)=>{
    // mainWindow.hide(); PRODUCTION
    force_quit = true; app.quit(); //DEBUG
})
ipcMain.on('minimizeWindow',(e,data)=>{
  mainWindow.minimize();
})

ipcMain.on('downloadVideo',(e,data)=>{
    var request = https.get(`https://img.youtube.com/vi/${data.id}/hq1.jpg`, function(response) {
        let file = fs.createWriteStream(`./imagens/${data.id}.jpg`)
        response.pipe(file);
        downloadVideo(data)
    });
})
ipcMain.on('getTitle',(e,data)=>{
  try{
    console.log(data);
    //const video = await youtubedl(data.url,['--format=18'])
    youtubedl.getInfo(data.url, ['--format=18'], function(err, info) {
      if (err) console.log(err)

      let nome = info._filename.replace("-"+data.id,"");
      nome = nome.replace(".mp4","");
      e.sender.send('videoTitle',{title:nome});
    })

  }
  catch(e){

  }
  
})

function downloadVideo(data) {
    const video = youtubedl(data.url,['--format=18'],{ cwd: __dirname })
    video.on('info', function(info) {
        
        let nome = info._filename.replace("-"+data.id,"");
        let icone = `./imagens/${data.id}.jpg`

        console.log('Download started');
        console.log('filename: ' + nome);
        console.log('size: ' + info.size);


        video.pipe(fs.createWriteStream('./videos/'+nome))

        video.on('end', function() {
            showNotification("Download Concluido","O Download do video " + nome + " foi finalizado com sucesso", icone);
        })

    })
}

function showNotification (titulo, corpo, icone) {
    const notification = {
      icon: icone,
      title: titulo,
      body: corpo
    }
    new Notification(notification).show()
  }

//app.on('ready', createWindow);

app.on('quit', () => rimraf("./imagens", function () { console.log("done"); }))

app.on('window-all-closed', (e) => {  
  e.preventDefault();
})