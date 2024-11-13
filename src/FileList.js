import React, { useState, useEffect } from 'react';
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import './FileList.css';

const MasonryPhotoAlbum2 = ({ photos, onPhotoClick }) => {
  return (
    <div className="masonry-grid">
      {photos.map((photo, index) => (
        <div key={index} className="photo-item">
          <img
            src={photo.src}
            alt={photo.alt}
            onClick={() => onPhotoClick(photo)} // Aggiungi l'evento onClick
          />
        </div>
      ))}
    </div>
  );
};

function FileList() {
  const [data, setData] = useState(null);
  const [photos, setPhotos] = useState([{src: "", width:0, height:0}]);
  const [currentPath, setCurrentPath] = useState("/Volumes/");
  const [isScrolling, setIsScrolling] = useState(false);
  var [loadedImages, setLoadedImages] = useState(0);
  const imagesToLoad = 30;

  const [galleryMode, setGalleryMode] = useState(false);

  const handlePhotoClick = (photo) => {
    console.log('Foto cliccata:', photo);
    window.location.href = photo.src.replace("?thumbnail=true", "");
    // Puoi aggiungere altre logiche come mostrare una modale, cambiare stato, etc.
  };

  useEffect(() => {
    const onScroll = () => {
      if(window.innerHeight + window.scrollY >= document.body.offsetHeight) {
        if(!isScrolling){
          setIsScrolling(true);
          console.log("scrollend");
          loadImages();
        }
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [isScrolling]);

  function changeViewMode(){
    setGalleryMode(!galleryMode);
  }

  function loadImages(){//
    fetch(currentPath+'load-images?start='+loadedImages+'&end='+(loadedImages+imagesToLoad)+'&thumbnail=true')
      .then(response => { return response.json()})
      .then(data => {
        console.log('Dati ricevuti dal server:', data); // Stampa i dati nel log
        setLoadedImages(loadedImages + imagesToLoad);
        if(loadedImages != 0) setPhotos(photos => [...photos, ...data]);
        else setPhotos(data);
        console.log(loadedImages);

        setIsScrolling(false);
      })
      .catch(error => console.error('Error fetching data:', error));
  }

  useEffect(() => {
    fetch(currentPath)
      .then(response => { return response.json()})
      .then(data => {
        console.log('Dati ricevuti dal server:', data); // Stampa i dati nel log
        setData(data);
      })
      .catch(error => console.error('Error fetching data:', error));

    loadImages();
  }, [currentPath]);

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

  useEffect(() => {
    if(loadedImages == 0){
      console.log('Current Path updated:', currentPath);
      loadImages();
    }
  }, [currentPath, loadedImages]); // Si attiva ogni volta che currentPath cambia

  function navigateToDirectory(path){    
    setCurrentPath(decodeURIComponent(path));
    setLoadedImages(0);
    console.log('Navigate to ' + currentPath);
    fetch(decodeURIComponent(path))
      .then(response => {console.log('Dati ricevuti dal server:', response); return response.json()})
      .then(data => {
        console.log('Dati ricevuti dal server:', data); // Stampa i dati nel log
        setData(data);
      })
      .catch(error => console.error('Error fetching data:', error));
    
    window.scrollTo(0, 0)
  }

  return (
    <div>
        <div className="path-bar">
          <span className="icon48 back-icon" onClick={navigateBack} style={{cursor:'pointer'}}></span>
          <h2>{currentPath}</h2>
        </div>
        <button onClick={changeViewMode}>{(galleryMode? "Explorer": "Gallery")}</button>
        {
          galleryMode && data? (
            <div>
              <div class="folder-grid">
              {data.map((item, index) => (
                item.isDirectory ? (
                  <div 
                    key={index} 
                    className="folder" 
                    onClick={() => navigateToDirectory(item.filepath)}
                  >
                    <span className="icon64 folder-icon"></span>
                    <p className='title'>{item.filename}</p>
                  </div>
                ) : null
              ))}
              </div>
              <MasonryPhotoAlbum2 photos={photos} onPhotoClick={handlePhotoClick}/>
            </div>
          ):
          (
            data ? (
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
            )
          )
        }
    </div>
  );
}

export default FileList;