// Modules
const https = require('https');
const fs = require('fs');
const express = require('express');
const path = require('path');
const sharp = require('sharp');

const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const { createCanvas } = require('canvas');

const app = express();

// ====  CONFIG ==============
const host = "192.168.1.23";        // Server IP
const port = 8080;                  // Server Port

const allowedClientsIP = [
    "192.168.1.5",
    "192.168.1.177",
    "192.168.1.23"
]

const baseDirectory = '/Volumes/';
// =================

// SSL Certificate
const SSLOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certificate/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certificate/cert.pem')),
};

const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const BOLD = '\x1b[1m';

function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Serve i file statici dalla cartella 'build'
app.use(express.static(path.join(__dirname, 'build')));

// Cross-Origin Resource Sharing for localhost:3000
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:3000");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

// In caso di altre richieste, restituisci sempre index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});


async function scanDirectory(targetPath) {
    var files = fs.readdirSync(targetPath);
    
    // Filter hidden files (starting with ".")
    files = files.filter(file => !file.startsWith('.'));

    // Order the files putting the directories on the top of the list
    files.sort((a, b) => {
        const aIsDirectory = fs.statSync(path.join(targetPath, a)).isDirectory();
        const bIsDirectory = fs.statSync(path.join(targetPath, b)).isDirectory();

        // If one of them is a directory, put it before
        if (aIsDirectory && !bIsDirectory) return -1;
        if (!aIsDirectory && bIsDirectory) return 1;

        // If both are folder or files, order by letter
        return a.localeCompare(b);
    });

    // Generate the info for each file
    const fileList = files.map(file => {
        const displayPath = path.join(targetPath, file);
        const isDirectory = fs.statSync(displayPath).isDirectory();
        return {
            filepath: path.join(targetPath, file) + (isDirectory ? '/' : ''),
            filename: file,
            isDirectory: isDirectory
        };
    });
    
    return fileList;
}


// Funzione per generare la thumbnail
async function generateVideoThumbnailInMemory(videoPath, timestamp = '00:00:00.001') {
    return new Promise((resolve, reject) => {
        const ffmpegProcess = ffmpeg(videoPath)
            .outputOptions([
                '-vframes 1',         // Estrai un singolo frame
                '-ss', timestamp,     // Imposta il timestamp
                '-f image2pipe',      // Scrivi l'immagine come stream
                '-vcodec mjpeg',       // Usa il codec MJPEG
                '-vf', 'scale=w=120:h=-1' // Imposta la larghezza a W e altezza calcolata automaticamente per mantenere l'aspect ratio
            ])
            .format('mjpeg');

        // Stream in memoria
        var passThrough = new PassThrough();
        
        ffmpegProcess
            .pipe(passThrough, { end: false })
            .on('error', (err) => {
                console.error('Errore durante la generazione della thumbnail:', err);
                reject(err);
            });

        const chunks = [];

        passThrough.on('data', (chunk) => {
            console.log("Chunk ricevuto");
            chunks.push(chunk);
        });

        passThrough.on('close', () => {
            console.log('FFmpeg processo chiuso');
        })

        passThrough.on('end', () => {
            // Combina i chunk per ottenere il buffer
            /*console.log('Flusso terminato');
            const buffer = Buffer.concat(chunks);
            resolve(buffer);*/
        });

        ffmpegProcess.on('end', () => {
            console.log('Elaborazione completata.');
            const buffer = Buffer.concat(chunks);
            resolve(buffer);
            //outputStream.end(); // Chiudi manualmente lo stream quando FFmpeg è finito
        });

        ffmpegProcess.on('error', (err) => {
            console.error('Errore durante l\'elaborazione del video:', err.message);
            // Ulteriori azioni da intraprendere in caso di errore
            const canvas = createCanvas(240, 120);
            const ctx = canvas.getContext('2d');

            // Riempie l'immagine di nero
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, 240, 120);

            // Restituisce l'immagine come buffer JPEG
            resolve(canvas.toBuffer('image/jpeg'));
        })

        ffmpegProcess.run();

    });
}

app.get("*/load-images?", async (req, res) => {
    console.log(req.url);
    const url = new URL(req.url, `https://${host}:${port}`);
    const start = parseInt(url.searchParams.get('start')) || 0;
    const end = parseInt(url.searchParams.get('end')) || -1;
    const thumbnail = url.searchParams.has('thumbnail');
        //console.log(thumbnail);

        try {
            //console.log(imageDir);
            const baseURL = decodeURIComponent(req.url.split('load-images?')[0]);
            console.log(baseURL);

            var limitedFiles;

            console.log("Start=", start, "end=", end);

            // Note: HEIC format seems to be supported only on Safari.
            const files = await fs.promises.readdir(baseURL);
            const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|bmp|webp|heic)$/i.test(file));
            if(end > start) limitedFiles = imageFiles.slice(start, end);
            else limitedFiles = imageFiles;

            // Invia le thumbnail come array JSON con i percorsi relativi
            res.writeHead(200, { 'Content-Type': 'application/json' });

            // JSON
            filesInfo = await Promise.all(limitedFiles.map(async (file) => {
                const metadata = await sharp(baseURL + file).metadata();
                return {
                    src: thumbnail ? `https://${host}:${port}${baseURL}${file}?thumbnail=true` : `https://${host}:${port}${baseURL}${file}`,
                    width: metadata.width,
                    height: metadata.height
                };
            }));

            res.end(JSON.stringify(filesInfo));
        } catch (err) {
            console.error('Errore nel caricamento delle immagini:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Errore del server');
        }
        return;
});

app.get("*/load-videos?", async (req, res) => {
    console.log(req.url);
    const url = new URL(req.url, `https://${host}:${port}`);
    const start = parseInt(url.searchParams.get('start')) || 0;
    const end = parseInt(url.searchParams.get('end')) || -1;
    const thumbnail = url.searchParams.has('thumbnail');
        //console.log(thumbnail);

        try {
            //console.log(imageDir);
            const baseURL = decodeURIComponent(req.url.split('load-videos?')[0]);
            console.log(baseURL);

            var limitedFiles;

            console.log("Start=", start, "end=", end);

            // Note: HEIC format seems to be supported only on Safari.
            const files = await fs.promises.readdir(baseURL);
            const videoFiles = files.filter(file => /\.(mp4|avi|mkv|mov|ts|flv|bmp|webm)$/i.test(file));
            if(end > start) limitedFiles = videoFiles.slice(start, end);
            else limitedFiles = videoFiles;

            // Invia le thumbnail come array JSON con i percorsi relativi
            res.writeHead(200, { 'Content-Type': 'application/json' });

            // JSON
            const filesInfo = limitedFiles.map((file) => ({
                src: thumbnail ? `https://${host}:${port}${baseURL}${file}?thumbnail=true` : `https://${host}:${port}${baseURL}${file}`,
                width: undefined,
                height: undefined
            }));

            res.end(JSON.stringify(filesInfo));
        } catch (err) {
            console.error('Errore nel caricamento dei video:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Errore del server');
        }
        return;
});

function isVideoOrImage(path) {
    // Lista delle estensioni video e immagine
    const videoExtensions = ['mp4', 'avi', 'mov', 'webm'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'tiff', 'webp'];

    // Ottieni l'estensione del file
    const extension = path.split('.').pop().toLowerCase();

    if (videoExtensions.includes(extension)) {
        return 'video';
    } else if (imageExtensions.includes(extension)) {
        return 'image';
    } else {
        return 'unknown'; // Nessuna corrispondenza
    }
}

app.get('*', async (req, res) => {
    const rclientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if(!allowedClientsIP.includes(rclientIp)){
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Accesso non autorizzato');
        console.log("Client IP", rclientIp, ": Accesso non autorizzato.");
        return;
    } 

    const path = decodeURIComponent(req.url);

    console.log("\n" + BOLD + CYAN + "◼️ Client " + rclientIp + RESET + " [" + getCurrentTime() + "]" + RESET);
    console.log(CYAN + "GET" + RESET, path);

    if(req.query.thumbnail === 'true'){
        const imageURL = req.url.replace("?thumbnail=true", "");
        if(isVideoOrImage(imageURL) === 'video'){
            const thumbnail = await generateVideoThumbnailInMemory(decodeURIComponent(imageURL));
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(thumbnail);
            return;
        }   
        else {
            try {
                const thumbnail = await sharp(decodeURIComponent(imageURL))
                    .resize(150) // Dimensioni thumbnail
                    .toBuffer();
                
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                res.end(thumbnail);
            } catch (err) {
                console.error('Errore nella creazione della thumbnail:', err);
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Immagine non trovata');
            }
            return;
        }
        
    }

    try {
        // Verifica se il percorso è una directory
        const stats = fs.statSync(path);
    
        if(stats.isDirectory()) {
            const files = await scanDirectory(path);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } else {
            // TODO: check if exists
            res.sendFile(path);
        }
    }
    catch(err){
        res.status(400).send("The path doesn't exist.");
    }
});

// Avvia il server HTTPS
https.createServer(SSLOptions, app).listen(port, host, () => {
  console.log(`Server running at https://${host}:${port}/`);
});
