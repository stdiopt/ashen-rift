import {mkdirSync,rmSync,cpSync,writeFileSync} from 'node:fs';
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/server',{recursive:true});
cpSync('public','dist/client',{recursive:true});cpSync('server/worker.js','dist/server/index.js');
writeFileSync('dist/server/wrangler.json',JSON.stringify({name:'ashen-rift',main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']},d1_databases:[{binding:'DB',database_name:'ashen-rift',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:'../../drizzle'}]},null,2));
