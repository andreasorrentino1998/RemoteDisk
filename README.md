# RemoteDisk

A web server to access your files over the local network from any device.

## Installation

Install NodeJS on your computer:

```
brew install node   # macOS
```

Clone this repository and move to the project root:

```
git clone https://github.com/andreasorrentino1998/RemoteDisk
cd RemoteDisk
```

Install the dependecies:

```
npm install
```

Build the client-side app:

```
npm run build
```

## Configuration
Inside the `server.js`, change the parameters in the section marked as `CONFIG`. For example:

```
const host = "192.168.0.1";     // Server IP
const port = 8080;              // Server Port

const allowedClientsIP = [
    "192.168.0.1",
    "192.168.0.2",
    "192.168.0.3"
]

const baseDirectory = '/Volumes/';
```

Since the web server uses the `https` protocol, you need a SSL certificate too.  
Create a new folder to store the SSL certificate:

```
mdkir ceritificate
cd certificate
```

Generate the SSL certificate using OpenSSL:

```
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

It will generate a certificate `cert.pem` and a private key `key.pem`. The certificate will be valid for 365 days. Since you're using a self-signed certificate for local development, the client web browser will consider the connection as "not secure", because the authority that issued the certificate is not trusted.

## Usage
Start the server on your computer:

```
node server.js
```

Once the server is running, you can connect to it from any device on the same local network. Open a web browser and enter the server IP address followed by its port in the address bar. For example, if the server IP is `192.168.0.1` and its port is `8080`, you should type the address:


```
https://192.168.0.1:8080/
```