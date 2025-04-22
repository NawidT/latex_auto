import { useEffect, useState } from 'react';


function Codebase() {
  const [named_ents, setNamedEnts] = useState(new Set());
  const [codebase, setCodebase] = useState("");
  const [vectordb, setVectorDB] = useState([]); // array of vectors [chunk_id, vector]
  const [vector_metadata, setVectorMetadata] = useState(new Map()); // array of metadata chunk_id -> [latex_code, desription]

  useEffect(() => {
    // get the codebase from the current tab
    overleaf_ide = document.getElementsByClassName("cm-content cm-lineWrapping");
    if (overleaf_ide.length > 0) {
      setCodebase(overleaf_ide[0].innerText);
    }

    // assign ents 


    // break up codebase into chunks 
    
  }, []);






  return null;
}