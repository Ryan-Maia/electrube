const { app, BrowserWindow, ipcMain, Menu, Tray, globalShortcut, clipboard, Notification } = require("electron");
const electron = require("electron");
const { ipcRenderer } = electron;
const youtubedl = require('youtube-dl');
const rimraf = require("rimraf");
const https = require("https");
const fs = require('fs');
const md5 = require('md5');
const ffmpeg = require('fluent-ffmpeg');
const moment = require('moment')
const { CLIENT_RENEG_LIMIT } = require("tls");


let force_quit = null;
let tray = null;
let mainWindow = null;
let checkFirstInstance = app.requestSingleInstanceLock();

ffmpeg.setFfmpegPath('./ffmpeg/bin/ffmpeg.exe');
ffmpeg.setFfprobePath('./ffmpeg/bin/ffprobe.exe')
ffmpeg.setFlvtoolPath('./ffmpeg/bin/ffplay.exe');
// if is the first instance = true; else = false.

//-----------------------------------------------------------//
//----------- Code that lock one instance at time -----------//
if (!checkFirstInstance) {
	app.quit();
} else {
	app.on('second-instance', (event, commandLine, workingDirectory) => {
		mainWindow.show();
		mainWindow.focus();
	});
}
//-----------------------------------------------------------//

app.whenReady().then(() => {
	if (!fs.existsSync('./imagens')) {
		fs.mkdirSync('./imagens');
	}
	if (!fs.existsSync('./Videos')) {
		fs.mkdirSync('./Videos');
	}
	if (!fs.existsSync('./temp')) {
		fs.mkdirSync('./temp');
	}
	//----------------------------------//
	//----------- Tray Setup -----------//
	tray = new Tray('./icon.png')
	const contextMenu = Menu.buildFromTemplate([
		{
			label: '🎞Abrir🎞',
			click: function () { mainWindow.show(); mainWindow.focus() }
		},
		{
			label: '❌Sair❌',
			click: function () { force_quit = true; app.quit(); }
		}
	]);
	tray.setToolTip('Copie o link do video e pressione alt + 5 para salvar o video')
	tray.setContextMenu(contextMenu)
	//----------------------------------//

	globalShortcut.register('Alt+numadd', () => {
		let videoUrl = clipboard.readText()
		let videoId = videoUrl.split('?v=').pop().split('&')[0];
		let file = fs.createWriteStream(`./imagens/${videoId}.jpg`)
		var request = https.get(`https://img.youtube.com/vi/${videoId}/hq1.jpg`, function (response) {
			response.pipe(file);
			downloadVideo({ "url": videoUrl, "id": videoId })
		});
	})

	createWindow();

	mainWindow.on('close', (e) => {
		if (!force_quit) {
			e.preventDefault();
			console.log("opa");
			mainWindow.hide();
		}
	})
})





function createWindow() {
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

ipcMain.on('closeWindow', (e, data) => {
	// mainWindow.hide(); PRODUCTION
	force_quit = true; app.quit(); //DEBUG
})
ipcMain.on('minimizeWindow', (e, data) => {
	mainWindow.minimize();
})

ipcMain.on('downloadVideo', (e, data) => {
	var request = https.get(`https://img.youtube.com/vi/${data.id}/hq1.jpg`, function (response) {
		let file = fs.createWriteStream(`./imagens/${data.id}.jpg`)
		response.pipe(file);
		downloadVideo(data)
	});
})
ipcMain.on('getTitle', (e, data) => {
	try {
		console.log(data);
		//const video = await youtubedl(data.url,['--format=18'])
		youtubedl.getInfo(data.url, ['--format=18'], function (err, info) {
			if (err) console.log(err)

			let nome = info._filename.replace("-" + data.id, "");
			nome = nome.replace(".mp4", "");
			e.sender.send('videoTitle', { title: nome });
		})

	}
	catch (e) {

	}

})

ipcMain.on('getFormats', (e, data) => {
	youtubedl.getInfo(data.url, [`--format=mp4`], function (err, info) {
    //console.log(info.formats);
		let formatos = info.formats.map((e) => {
			return {
				'format_id': e.format_id,
				'format': e.ext,
				'resolution': e.height,
				'audio' : e.acodec,
				'filesize': e.filesize
			}
    });
    formatos = formatos.filter((item) => item.filesize != null && item.format == "mp4")
    formatos.unshift({
      'format_id': 18,
      'format': 'MP3',
      'resolution': 'Audio',
      'audio' : 'MP3'
    })
		e.sender.send('videoFormats', { formats: formatos });
	});
});

function downloadVideo(data) {
	let temp = new Date().getTime()
	temp = md5(temp);

	const video = youtubedl(data.url, [`--format=${data.format_id}`], { cwd: __dirname })
	video.on('info', function (info) {

		let nome = info._filename.replace("-" + data.id, "");
		let icone = `./imagens/${data.id}.jpg`
		
		console.log('Download started');
		console.log('filename: ' + nome);
		console.log('size: ' + info.size);



		//video.pipe(fs.createWriteStream('./videos/' + nome))
		video.pipe(fs.createWriteStream('./temp/video' + temp))


		video.on('end', function () {
			console.log(data);
			if(data.format_id == 18 && data.format == 'MP3'){
				nome = nome.replace("mp4","mp3")
				ffmpeg('./temp/video' + temp).toFormat('mp3').save('./Videos/'+nome).on("end", function() {
					showNotification("Download Concluido", "O Download do video " + nome + " foi finalizado com sucesso", icone);
					fs.unlink('./temp/video' + temp,() => {})
				})
			} else {
				const audio = youtubedl(data.url, [`--format=${18}`], { cwd: __dirname })
				audio.on('info', function (info) {
					audio.pipe(fs.createWriteStream('./temp/audio' + temp))
				})
				audio.on('end', function () {
					if (data.cortes != "") {
						let cortes = ffmpeg()
						ffmpeg('./temp/video' + temp).addInput('./temp/audio' + temp).save('./temp/corte' + temp + '.mp4').on("end", async function() {
							fs.unlink('./temp/video' + temp,() => {})
							fs.unlink('./temp/audio' + temp,() => {})

							let arrCortes = data.cortes.split(";")
							
							for (const [i, item] of arrCortes.entries()){
								let corte = item.split("-");
								let inicio = moment("1111-11-11 " + corte[0])
								let fim = moment("1111-11-11 " + corte[1])
								let diff = fim.diff(inicio);
								let duracao = moment.utc(diff).format("HH:mm:ss");

								//console.log('corte na posicao 0: '+corte[0]);
								//console.log('duracao: '+ duracao);
								//console.log('caminho inteiro do corte: '+ "./temp/corte" + temp + i);
								await new Promise((resolve,reject) => {

									ffmpeg("./temp/corte" + temp + '.mp4').setStartTime(corte[0]).setDuration(duracao).save("./temp/corte" + temp + i + '.mp4').on("end", function(){
										console.log("um ja foi");
										cortes.addInput("./temp/corte" + temp + i + '.mp4')
										resolve();
									})
								})
							}

							cortes.mergeToFile("./Videos/"+nome,'./temp/').on("end", function() {
								console.log("terminou os cortes");
								showNotification("Download Concluido", "O Download do video " + nome + " foi finalizado com sucesso", icone);
							})
						})

						
					} else {
						ffmpeg('./temp/video' + temp).addInput('./temp/audio' + temp).save("./Videos/"+nome).on("end", function() {
							showNotification("Download Concluido", "O Download do video " + nome + " foi finalizado com sucesso", icone);
							fs.unlink('./temp/video' + temp,() => {})
							fs.unlink('./temp/audio' + temp,() => {})
						})
					}
				})
			}
		})
	})


}

function showNotification(titulo, corpo, icone) {
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