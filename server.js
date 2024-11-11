// Modules
const https = require('https');
const fs = require('fs');
const express = require('express');
const path = require('path');
const sharp = require('sharp');

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

app.get('/gallery/*', (req, res) => {
    const baseURL = req.url.replace("/gallery/", "");
    const IMAGES_PER_PAGE = 30;
    // Invia la pagina HTML iniziale con il JavaScript per il caricamento progressivo
    let html = `
    <html>
    <body>
        <h1>Galleria Thumbnail</h1>
        <a onclick='window.history.back()'>File Manager Mode</a>
        <div id="gallery" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;"></div>
        <script>
            let start = 0;
            const IMAGES_PER_PAGE = ${IMAGES_PER_PAGE};
            const gallery = document.getElementById('gallery');

            // Funzione per caricare le immagini
            async function loadImages() {
                const response = await fetch('/${baseURL}load-images?start=' + start + '&thumbnail=true');
                const images = await response.json();
                if (images.length > 0) {
                    images.forEach(src => {
                        const a = document.createElement('a');
                        a.href = 'https://${host}:${port}/' + src.replace('?thumbnail=true', '');
                        const img = document.createElement('img');
                        img.src = 'https://${host}:${port}/' + src;
                        console.log(src);
                        img.style.width = '100%';
                        img.style.height = 'auto';
                        a.appendChild(img);
                        gallery.appendChild(a);
                    });
                    start += IMAGES_PER_PAGE;
                }
            }

            // Carica le prime immagini
            loadImages();

            // Rileva lo scroll per il caricamento progressivo
            window.addEventListener('scroll', () => {
                if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
                    loadImages();
                }
            });
        </script>
    </body>
    </html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
});

app.get("*/load-images?", async (req, res) => {
    const IMAGES_PER_PAGE = 30;
    console.log(req.url);
    const url = new URL(req.url, `https://${host}:${port}`);
    const start = parseInt(url.searchParams.get('start')) || 0;
    const thumbnail = url.searchParams.has('thumbnail');
        //console.log(thumbnail);

        try {
            //console.log(imageDir);
            const baseURL = decodeURIComponent(req.url.split('load-images?')[0]);
            console.log(baseURL);

            const files = await fs.promises.readdir(baseURL);
            const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
            const limitedFiles = imageFiles.slice(start, start + IMAGES_PER_PAGE);

            // Invia le thumbnail come array JSON con i percorsi relativi
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(limitedFiles.map(file => thumbnail ? `${baseURL}${file}?thumbnail=true` : `/${file}`)));
            
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
                .resize(150, 150, /*{ fit: 'inside' }*/) // Dimensioni thumbnail
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
  console.log(`Server running at http://${host}:${port}/`);
});
