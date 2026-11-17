import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react(),{
  name:'jeltops-ux-local-fixtures',
  enforce:'pre',
  resolveId(id) {
    if (['firebase/auth','firebase/firestore'].includes(id)||id.includes('firebaseConfig')) return '\0ux:'+id;
  },
  load(id) {
    if (!id.startsWith('\0ux:')) return;
    if (id.endsWith('firebase/auth')) return `
      export const onAuthStateChanged=(auth,fn)=>{ const id=setTimeout(()=>fn(auth.currentUser),0); return ()=>clearTimeout(id) };
      export const GoogleAuthProvider=class {};
      export const signInWithPopup=()=>{};
      export const signOut=()=>{};`;
    if (id.endsWith('firebase/firestore')) return `
      export const collection=()=>null,query=()=>null,orderBy=()=>null,limit=()=>null;
      export const onSnapshot=(q,fn)=>{const t=setTimeout(()=>fn({docs:[{id:'ref',data:()=>({target:'Google Endpoint',status:'UP',statusCode:200,latencyMs:35,timestamp:{toDate:()=>new Date()}})}]}),0);return ()=>clearTimeout(t)};`;
    return `export const db={}; export const auth={currentUser:{email:'demo@example.com',getIdToken:async()=>'fixture'}};`;
  }
}]});
