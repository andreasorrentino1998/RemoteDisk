import React, { useState, useEffect } from 'react';
import './FileList.css';

function FileList() {
  const [data, setData] = useState(null);
  const [currentPath, setCurrentPath] = useState("/Volumes/");

  useEffect(() => {
    fetch('/Volumes/')
      .then(response => { return response.json()})
      .then(data => {
        console.log('Dati ricevuti dal server:', data); // Stampa i dati nel log
        setData(data);
      })
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  function navigateBack(){
    if(currentPath != "/Volumes/"){
        console.log(currentPath);
        const parts = currentPath.split('/');
        parts.pop();    // Remove the slash
        parts.pop();    // Remove the last directory
        const newPath = parts.join('/') + "/";
        navigateToDirectory(newPath);
    }
  }

  function openFile(path){
    const exts = ["mkv", "ts", "flv", "avi"];
    const fileExt = path.split('.').pop().toLowerCase();
    if(exts.includes(fileExt)){
        const baseURL = `${window.location.protocol}//${window.location.host}`;
        navigator.clipboard.writeText(baseURL + path);
        return;
    }
    window.location.href = path;
  }

  function navigateToDirectory(path){
    console.log('Navigate to ' + path);
    fetch(path)
      .then(response => {console.log('Dati ricevuti dal server:', response); return response.json()})
      .then(data => {
        console.log('Dati ricevuti dal server:', data); // Stampa i dati nel log
        setData(data);
        setCurrentPath(decodeURIComponent(path));
      })
      .catch(error => console.error('Error fetching data:', error));
  }

  return (
    <div>
        <h2>{currentPath}</h2>
        <a href={"/gallery"+currentPath}>Gallery Mode</a>
        <p onClick={navigateBack} style={{cursor:'pointer'}}><b>...</b></p>
      {data ? (
    <ul>
      {data.map((item, index) => (
        <li key={index}
            className={(item.isDirectory ? 'folder' : 'file')}
            onClick={() => (item.isDirectory ? navigateToDirectory(item.filepath) : openFile(item.filepath)) }>
            <span className={"icon " + (item.isDirectory ? 'folder-icon' : 'file-icon')}></span>
            <span className='title'>{item.filename}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p>Loading...</p>
  )}
    </div>
  );
}

export default FileList;