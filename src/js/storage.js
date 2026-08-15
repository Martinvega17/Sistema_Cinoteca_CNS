export const STORAGE_KEY = 'ipicyt_bitacora_registros';
export const FOLIO_KEY = 'ipicyt_bitacora_folio';

export function saveToLocalStorage(records, folio){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    localStorage.setItem(FOLIO_KEY, String(folio));
  }catch(err){
    console.error('No se pudo guardar el respaldo local:', err);
  }
}

export function loadFromLocalStorage(){
  try{
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedFolio = localStorage.getItem(FOLIO_KEY);
    return {
      records: saved ? JSON.parse(saved) : [],
      folio: savedFolio ? parseInt(savedFolio, 10) || 1 : 1
    };
  }catch(err){
    console.error('No se pudo leer el respaldo local:', err);
    return { records: [], folio: 1 };
  }
}