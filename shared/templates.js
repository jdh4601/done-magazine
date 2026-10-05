// The numbered source files define the order, including intentional duplicates.
export const BODY_TEMPLATES = [
  {file:'#2.jpg',layout:'photo-overlay'},
  {file:'#3.jpg',layout:'dark-top'},
  {file:'#4.jpg',layout:'dark-bottom'},
  {file:'#5.jpg',layout:'dark-bottom'},
  {file:'#6.jpg',layout:'photo-overlay'},
].sort((a,b)=>a.file.localeCompare(b.file,undefined,{numeric:true}));
export const ENDING_TEMPLATE = '#7.jpg';
export const bodyTemplate = index => BODY_TEMPLATES[index % BODY_TEMPLATES.length];
export const templateUrl = file => `/templates/${encodeURIComponent(file)}`;
