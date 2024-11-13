// Modules
const https = require('https');
const fs = require('fs');
const express = require('express');
const path = require('path');
const sharp = require('sharp');

const app = express();

// ====  CONFIG ==============
const host = "";        // Server IP
const port = 8080;      // Server Port

const allowedClientsIP = [
    "",
    "",
    ""
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

            const files = await fs.promises.readdir(baseURL);
            const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
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

app.get('*', async (req, res) => {
    const rclientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if(!allowedClientsIP.includes(rclientIp)){
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Accesso non autorizzato');
        return;
    } 

    const path = decodeURIComponent(req.url);

    console.log("\n" + BOLD + CYAN + "◼️ Client " + rclientIp + RESET + " [" + getCurrentTime() + "]" + RESET);
    console.log(CYAN + "GET" + RESET, path);

    if(req.query.thumbnail === 'true'){
        const imageURL = req.url.replace("?thumbnail=true", "");
    
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
