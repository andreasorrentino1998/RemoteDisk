const https = require("https");
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const mime = require('mime-types'); // Per determinare il tipo MIME del file

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

const IMAGES_PER_PAGE = 30;

var imageDir = "";

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

const requestListener = async (req, res) => {
    //console.log("PATH", req.url);

    const rclientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if(!allowedClientsIP.includes(rclientIp)){
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Accesso non autorizzato');
        return;
    } 

    if(req.url.slice(0,9) == "/gallery/"){
        imageDir= decodeURIComponent(req.url.slice(9, req.url.length));
        //console.log(imageDir);
    }

    const url = new URL(req.url, `https://${host}:${port}`);
    //console.log(url);

    if (url.pathname.slice(0,9) === '/gallery/') {
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
                    const response = await fetch('/load-images?start=' + start + '&thumbnail=true');
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
    }

    // Verifica se l'URL contiene il parametro 'start' per il caricamento progressivo
    if (url.pathname === '/load-images') {
        const start = parseInt(url.searchParams.get('start')) || 0;
        const thumbnail = url.searchParams.has('thumbnail');
        //console.log(thumbnail);

        try {
            //console.log(imageDir);
            const files = await fs.promises.readdir(baseDirectory+imageDir);
            const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
            const limitedFiles = imageFiles.slice(start, start + IMAGES_PER_PAGE);

            // Invia le thumbnail come array JSON con i percorsi relativi
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(limitedFiles.map(file => thumbnail ? `${imageDir}${file}?thumbnail=true` : `/${file}`)));
            
        } catch (err) {
            console.error('Errore nel caricamento delle immagini:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Errore del server');
        }
        return;
    }

    const hasThumbnail = req.url.includes("?thumbnail=true");

    // Gestisci le richieste per le immagini specifiche
    const imagePath = path.join("/", req.url.replace('/', '').replace("?thumbnail=true", ""));
    //console.log(req.url);
    //console.log(imagePath);

    if(hasThumbnail){
        // Invia la thumbnail
        try {
            const thumbnail = await sharp(baseDirectory + decodeURIComponent(imagePath))
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
    
    const requestedPath = decodeURIComponent(req.url);
    var targetPath = path.join(baseDirectory, requestedPath);
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log("\n" + BOLD + CYAN + "◼️ Client " + clientIp + RESET + " [" + getCurrentTime() + "]" + RESET);
    console.log(CYAN + "GET" + RESET, requestedPath);

    // Controlla se c'è una richiesta di range
    const range = req.headers.range;
    if(range){
        // Parsing del range, supponendo che venga nel formato: "bytes=start-end"
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10): "";
        console.log(CYAN + "Bytes" + RESET, "[" + start + ", " + end + "]");
    }
    console.log("File richiesto: ", targetPath);

    if(targetPath.includes("/app/") || targetPath.includes("/static/")
    ||  targetPath.includes("manifest.json")
    ||  targetPath.includes("favicon.ico")
    ||  targetPath.includes("logo192.png")
    ||  targetPath.includes("logo512.png")
    ){
        targetPath = targetPath.replace("/Volumes/", "");
        if(targetPath.includes("app/")) targetPath = targetPath.replace("app/", "");
        targetPath = "build/" + targetPath;
        const fileStream = fs.createReadStream(targetPath);

        if(targetPath.includes(".html")) res.writeHead(200, { 'Content-Type': 'text/html' });
        else if(targetPath.includes(".css")) res.writeHead(200, { 'Content-Type': 'text/css' });
        else if(targetPath.includes(".js")) res.writeHead(200, { 'Content-Type': 'text/js' });
        else if(targetPath.includes(".json")) res.writeHead(200, { 'Content-Type': 'text/json' });
        else if(targetPath.includes(".svg")) res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        else if(targetPath.includes(".ico")) res.writeHead(200, { 'Content-Type': 'image/x-icon' });
        else if(targetPath.includes(".png")) res.writeHead(200, { 'Content-Type': 'image/png' });

        fileStream.pipe(res);
        return;
    }

    fs.stat(targetPath, (err, stats) => {
        if (err) {
            console.log("File di testo richiesto.");
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`<h1>404 Not Found</h1><p>${err.message}</p>`);
            return;
        }

        if (stats.isDirectory()) {
            fs.readdir(targetPath, (err, files) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`<h1>500 Internal Server Error</h1><p>${err.message}</p>`);
                    return;
                }

                // Filtra i file nascosti che iniziano con "."
                files = files.filter(file => !file.startsWith('.'));

                //console.log(files);
                
                
                // Ordina i file basato sulla condizione che le directory vengano messe per prime
                files.sort((a, b) => {
                    const aIsDirectory = fs.statSync(path.join(targetPath, a)).isDirectory();
                    const bIsDirectory = fs.statSync(path.join(targetPath, b)).isDirectory();

                    // Se uno dei due è una directory, mettilo prima
                    if (aIsDirectory && !bIsDirectory) return -1;
                    if (!aIsDirectory && bIsDirectory) return 1;

                    // Se entrambi sono o file o directory, ordina alfabeticamente
                    return a.localeCompare(b);
                });

                const fileList = files.map(file => {
                    const displayPath = path.join(targetPath, file);
                    const isDirectory = fs.statSync(displayPath).isDirectory();
                    return {
                        filepath: path.join(req.url, file) + (isDirectory ? '/' : ''),
                        filename: file,
                        isDirectory: isDirectory
                    };
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(fileList));
            });
        } else {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']; // Estensioni immagine supportate
            const videoExtensions = ['.mp4']
            const audioExtensions = ['.mp3']
            const textExtensions = [
                '.txt',       // File di testo generico
                '.c', '.cpp', '.h', '.hpp',  // C / C++
                '.java',      // Java
                '.py',        // Python
                '.js',        // JavaScript
                '.php',       // PHP
                '.rb',        // Ruby
                '.html', '.css', // HTML / CSS
                '.xml',       // XML
                '.json',      // JSON
                '.yaml', '.yml', // YAML
                '.go',        // Go
                '.swift',     // Swift
                '.rs',        // Rust
                '.ts',        // TypeScript
                '.sh',         // Bash
                '.qml',
                '.dart',
            ];
            const pdfExtensions = ['.pdf'];
            
            // Verifica se è un'immagine
            const extname = path.extname(targetPath).toLowerCase();
            if (imageExtensions.includes(extname)) {
                // Se è un'immagine, inviala con il tipo MIME appropriato
                let contentType = 'application/octet-stream'; // Fallback di default
                switch (extname) {
                    case '.jpg':
                    case '.jpeg':
                        contentType = 'image/jpeg';
                        break;
                    case '.png':
                        contentType = 'image/png';
                        break;
                    case '.gif':
                        contentType = 'image/gif';
                        break;
                    case '.bmp':
                        contentType = 'image/bmp';
                        break;
                    case '.webp':
                        contentType = 'image/webp';
                        break;
                    case '.svg':
                        contentType = 'image/svg+xml';
                        break;
                }

                // Invia l'immagine con il tipo MIME corretto
                const fileStream = fs.createReadStream(targetPath);
                res.writeHead(200, { 'Content-Type': contentType });
                fileStream.pipe(res);
            }
            // Verifica se è un file di testo
            else if (textExtensions.includes(extname)) {
                // Se è un file di testo, invia il contenuto come testo semplice
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                const fileStream = fs.createReadStream(targetPath, 'utf-8');
                fileStream.pipe(res);
                
            }
            // Verifica se è un file PDF
            else if (pdfExtensions.includes(extname)) {
                // Se è un file PDF, invia il PDF con il tipo MIME appropriato
                res.writeHead(200, { 'Content-Type': 'application/pdf' });
                const fileStream = fs.createReadStream(targetPath);
                fileStream.pipe(res);
            }
            // Verifica se è un file MP4
            else if (videoExtensions.includes(extname) || audioExtensions.includes(extname)){
                const fileSize = stats.size;

                // Controlla se c'è una richiesta di range
                const range = req.headers.range;
                if (range) {
                    // Parsing del range, supponendo che venga nel formato: "bytes=start-end"
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;

                    // Se i valori di range sono validi, invia il file parziale
                    if (start >= 0 && start <= fileSize -1 && end <= fileSize - 1) {
                        const chunkSize = (end - start) + 1;
                        const fileStream = fs.createReadStream(decodeURIComponent(targetPath), { start, end });

                        res.writeHead(206, {  // Stato '206 Partial Content'
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunkSize,
                            'Content-Type': 'video/mp4'
                        });

                        console.log("\n" + BOLD + CYAN + "◼️ Server" + RESET + " [" + getCurrentTime() + "]");
                        console.log(CYAN + "SEND" + RESET, targetPath);
                        console.log(CYAN + "Bytes" + RESET, "[" + start + ", " + end + "]");

                        fileStream.pipe(res);
                    } else {
                        res.writeHead(416, { 'Content-Type': 'text/plain' }); // Range non valido
                        res.end('Requested range not satisfiable');
                    }
                }
                else {
                    // Se non c'è una richiesta di range, invia il video intero
                    const videoStream = fs.createReadStream(decodeURIComponent(targetPath))
                    console.log("\n" + BOLD + CYAN + "◼️ Server" + RESET + " [" + getCurrentTime() + "]");
                    console.log("Video streaming started.")
                    res.writeHead(200, { 'Content-Type': 'video/mp4' });
                    videoStream.pipe(res); // Stream del video al client
                }
            }
            else {
                // Invia il file come un flusso binario se non è un'immagine
                const fileStream = fs.createReadStream(targetPath);
                res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
                fileStream.pipe(res);
            }
        }
    });
};

// Leggi i certificati SSL
const options = {
    key: fs.readFileSync("certificate/key.pem"),  // Private key
    cert: fs.readFileSync("certificate/cert.pem") // Certificate
};

const server = https.createServer(options, requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on https://${host}:${port}`);
});