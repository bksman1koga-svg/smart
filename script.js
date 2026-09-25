/*
 * SMART Kinerja Sekolah - Frontend Penilaian Final
 * GitHub Pages + Google Apps Script JSONP
 */
const API_URL = "https://script.google.com/macros/s/AKfycbywKtW_14eIQctf767ZkWih6LyQS1Dlj30DNYGCsPV2SGK5XPxLesQc9mPwntWP4fR1/exec";
let D = {};
let charts = {};

const cfg = {
  guru:['GURU',['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif','RPP_ModulAjar','InstrumenAsesmen','DokumenTepatWaktu']],
  indikator:['INDIKATOR',['Guru','Kategori','Indikator','Bobot','SkalaMin','SkalaMax','Nilai','Predikat','Deskripsi']],
  supervisi:['SUPERVISI',['Tanggal','Guru','Supervisor','Periode','Indikator','Nilai','Predikat','Catatan','TindakLanjut']],
  program:['PROGRAM',['NamaProgram','PenanggungJawab','Mulai','Selesai','Target','Realisasi','Persentase','Nilai','Predikat','Status','Anggaran','Catatan']],
  monitoring:['MONITORING',['Tanggal','Jenis','Objek','PenanggungJawab','Progress','Nilai','Predikat','Status','Catatan','TindakLanjut']],
  pembinaan:['PEMBINAAN',['Tanggal','Guru','Topik','Temuan','RencanaAksi','TargetSelesai','Nilai','Predikat','Status','Catatan']],
  keputusan:['KEPUTUSAN',['Tanggal','Bidang','Masalah','DataPendukung','Keputusan','PenanggungJawab','Deadline','NilaiDampak','Predikat','Status','Catatan']]
};

const esc = x => String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const scoreLabel = n => {
  n = Number(n);
  if (isNaN(n)) return '';
  if (n >= 90) return 'Sangat Baik';
  if (n >= 80) return 'Baik';
  if (n >= 70) return 'Cukup';
  return 'Perlu Perbaikan';
};
function ensureApi(){
  if(!API_URL || !/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(API_URL))
    throw new Error('API_URL belum diisi dengan URL Web App Google Apps Script /exec.');
}
function api(action, params={}){
  ensureApi();
  return new Promise((resolve,reject)=>{
    const callback="__smartKinerja_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    const query=new URLSearchParams({action,callback,_:Date.now().toString()});
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null)query.set(k,typeof v==="object"?JSON.stringify(v):String(v));});
    let finished=false;
    const cleanup=()=>{clearTimeout(timer);try{delete window[callback]}catch(e){}script.remove();};
    const timer=setTimeout(()=>{if(finished)return;finished=true;cleanup();reject(new Error("Google Apps Script tidak merespons. Cek deployment Web App dan URL /exec."));},15000);
    window[callback]=payload=>{if(finished)return;finished=true;cleanup();if(payload?.ok===false)reject(new Error(payload.error||"API error"));else resolve(payload?.data??payload);};
    script.onerror=()=>{if(finished)return;finished=true;cleanup();reject(new Error("Web App Google Apps Script tidak bisa diakses. Pastikan Execute as: Me dan Who has access: Anyone."));};
    script.src=API_URL+"?"+query.toString(); document.head.appendChild(script);
  });
}
function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.classList.add("on");setTimeout(()=>el.classList.remove("on"),2800);}
async function load(){
  try{D=await api("data");document.getElementById("school").textContent=D.settings?.school_name||"SMAN 1 Kota Gajah";await dash();}
  catch(e){document.getElementById("school").textContent="API belum tersambung";document.getElementById("view").innerHTML=`<div class="panel error"><b>Koneksi belum berhasil.</b><p>${esc(e.message)}</p><div class="api-note">Pastikan URL /exec benar dan deployment Apps Script sudah versi terbaru.</div></div>`;}
}
async function show(p,b){
  document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));b?.classList.add("active");
  document.getElementById("title").textContent=p==="dashboard"?"Dashboard":p.replace(/^./,x=>x.toUpperCase());
  try{if(p==="dashboard")await dash();else if(p==="laporan")await report();else if(p==="pengaturan")settings();else crud(p);}
  catch(e){document.getElementById("view").innerHTML=`<div class="panel error">${esc(e.message)}</div>`;}
}
function pct(n,d){return d?Math.round(n/d*100):0;}
async function dash(){
  const x=await api("dashboard");
  Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}});charts={};
  document.getElementById("view").innerHTML=`
    <div class="grid">
      <div class="card kpi">Guru terdaftar<div class="n">${esc(x.guru)}</div></div>
      <div class="card kpi">Rata-rata supervisi<div class="n">${esc(x.avg)}</div></div>
      <div class="card kpi">Program selesai<div class="n">${esc(x.program)}</div></div>
      <div class="card kpi">Pembinaan terbuka<div class="n">${esc(x.pembinaan)}</div></div>
    </div>
    <div class="panel chart-panel"><h3>Grafik Distribusi Nilai Kinerja Guru (%)</h3><div class="chart-box"><canvas id="chartKinerja"></canvas></div>
      <div class="chart-note">Sumber: menu Indikator Kinerja</div></div>
    <div class="grid charts-grid">
      <div class="panel chart-panel"><h3>Grafik Keterlaksanaan Supervisi Kelas (%)</h3><div class="chart-box small"><canvas id="chartSupervisi"></canvas></div><div class="chart-note">Sudah vs Belum Disupervisi</div></div>
      <div class="panel chart-panel"><h3>Grafik Kehadiran & Keaktifan Pembinaan (%)</h3><div class="chart-box small"><canvas id="chartPembinaan"></canvas></div><div class="chart-note">Guru yang memiliki riwayat pembinaan/pelatihan</div></div>
    </div>
    <div class="panel chart-panel"><h3>Grafik Kepatuhan Kelengkapan Dokumen Pembelajaran (%)</h3><div class="chart-box"><canvas id="chartDokumen"></canvas></div><div class="chart-note">Lengkap = RPP/Modul Ajar + instrumen asesmen + tepat waktu bernilai “Ya” pada Data Guru.</div></div>
    <div class="panel"><b>Alur kerja penilaian</b><p class="muted">Indikator Kinerja → Supervisi → Monitoring → Pembinaan → Keputusan → Laporan.</p></div>`;
  if(typeof Chart==="undefined"){toast("Library grafik belum termuat. Refresh halaman.");return;}
  const d=x.indikatorDist||{}, labs=['Sangat Baik','Baik','Cukup','Perlu Perbaikan'], vals=labs.map(k=>d[k]||0), total=vals.reduce((a,b)=>a+b,0);
  charts.kinerja=new Chart(document.getElementById("chartKinerja"),{type:"bar",data:{labels:labs,datasets:[{label:"Persentase guru",data:vals.map(v=>pct(v,total))}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+"%"}}}}});
  const sv=x.supervisi||{}, pb=x.pembinaan||{}, dc=x.dokumen||{};
  charts.supervisi=new Chart(document.getElementById("chartSupervisi"),{type:"doughnut",data:{labels:["Sudah Disupervisi","Belum Disupervisi"],datasets:[{data:[pct(sv.sudah,x.guru),pct(sv.belum,x.guru)]}]},options:{responsive:true,plugins:{legend:{position:"bottom"}}}});
  charts.pembinaan=new Chart(document.getElementById("chartPembinaan"),{type:"doughnut",data:{labels:["Sudah Pembinaan/Pelatihan","Belum"],datasets:[{data:[pct(pb.sudah,x.guru),pct(pb.belum,x.guru)]}]},options:{responsive:true,plugins:{legend:{position:"bottom"}}}});
  charts.dokumen=new Chart(document.getElementById("chartDokumen"),{type:"doughnut",data:{labels:["Lengkap","Belum Lengkap"],datasets:[{data:[pct(dc.lengkap,x.guru),pct(dc.belum,x.guru)]}]},options:{responsive:true,plugins:{legend:{position:"bottom"}}}});
}
function crud(p){
  const [sheet,cols]=cfg[p],arr=D[p]||[];
  if(p==="guru")return guruPage();
  document.getElementById("view").innerHTML=`<div class="panel"><div class="toolbar"><div><b>${esc(pageTitle(p))}</b><div class="muted">${helpText(p)}</div></div><button class="btn" onclick="form('${p}','${sheet}')">+ Tambah Penilaian</button></div>
    ${arr.length?`<div class="table-wrap"><table><tr><th>ID</th>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}<th>Aksi</th></tr>${arr.map(r=>`<tr><td>${esc(r.ID)}</td>${cols.map(c=>`<td>${c==="Predikat"?badge(r[c]):esc(r[c])}</td>`).join("")}<td><button class="btn red" onclick="del('${sheet}','${esc(r.ID)}','${p}')">Hapus</button></td></tr>`).join("")}</table></div>`:'<div class="empty">Belum ada data.</div>'}</div>`;
}
function pageTitle(p){return ({indikator:"Indikator Kinerja",supervisi:"Supervisi Kelas",program:"Program Sekolah",monitoring:"Monitoring",pembinaan:"Pembinaan Guru",keputusan:"Keputusan Berbasis Data"}[p]||p);}
function helpText(p){return ({indikator:"Nilai 0–100 otomatis menjadi predikat.",supervisi:"Nilai observasi 0–100 dan catatan refleksi.",program:"Realisasi dan persentase capaian program.",monitoring:"Progress 0–100% dengan predikat otomatis.",pembinaan:"Nilai evaluasi pasca-pembinaan 0–100.",keputusan:"Nilai dampak/efektivitas keputusan 0–100."}[p]||"");}
function badge(v){return v?`<span class="badge">${esc(v)}</span>`:"-";}
function guruPage(){
  const arr=D.guru||[];
  document.getElementById("view").innerHTML=`<div class="panel"><div class="toolbar guru-toolbar"><div><b>Data Guru</b><div class="muted">${arr.length} data guru</div></div><div class="actions"><button class="btn gray" onclick="downloadGuruTemplate()">Template Excel</button><label class="btn upload-btn">Upload Excel<input id="guruExcel" type="file" accept=".xlsx,.xls,.csv" hidden></label><button class="btn" onclick="form('guru','GURU')">+ Tambah Guru</button></div></div>
  <div class="searchbar"><input id="guruSearch" type="search" placeholder="🔎 Cari NIP, nama, NIK, mapel, jabatan, status..." autocomplete="off"><span class="muted" id="guruCount"></span></div><div id="guruTable"></div></div>`;
  document.getElementById("guruSearch").addEventListener("input",renderGuruTable);document.getElementById("guruExcel").addEventListener("change",handleGuruExcel);renderGuruTable();
}
function renderGuruTable(){
  const arr=D.guru||[],q=(document.getElementById("guruSearch")?.value||"").trim().toLowerCase();
  const filtered=!q?arr:arr.filter(r=>cfg.guru[1].some(k=>String(r[k]??"").toLowerCase().includes(q)));
  const el=document.getElementById("guruTable"),count=document.getElementById("guruCount");if(count)count.textContent=`Menampilkan ${filtered.length} dari ${arr.length}`;if(!el)return;
  el.innerHTML=filtered.length?`<div class="table-wrap"><table><tr><th>ID</th>${cfg.guru[1].map(c=>`<th>${esc(c)}</th>`).join("")}<th>Aksi</th></tr>${filtered.map(r=>`<tr><td>${esc(r.ID)}</td>${cfg.guru[1].map(c=>`<td>${c==="RPP_ModulAjar"||c==="InstrumenAsesmen"||c==="DokumenTepatWaktu"?badge(r[c]):esc(r[c])}</td>`).join("")}<td><button class="btn red" onclick="del('GURU','${esc(r.ID)}','guru')">Hapus</button></td></tr>`).join("")}</table></div>`:'<div class="empty">Data guru tidak ditemukan.</div>';
}
function downloadGuruTemplate(){
  const headers=['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif','RPP_ModulAjar','InstrumenAsesmen','DokumenTepatWaktu'];
  if(typeof XLSX==="undefined")return toast("Library Excel belum termuat. Refresh halaman.");
  const ws=XLSX.utils.aoa_to_sheet([headers,['197001012000000000','Contoh Nama Guru','1800000000000000','Matematika','Guru','Aktif','guru@sekolah.sch.id','Ya','Ya','Ya','Ya']]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Data Guru");XLSX.writeFile(wb,"Template_Data_Guru_SMART_Kinerja.xlsx");
}
function normalizeGuruHeader(h){
  const x=String(h??"").trim().toLowerCase().replace(/[\s_\-./]+/g,"");
  const map={nip:"NIP",nomorindukpegawai:"NIP",nipguru:"NIP",nama:"Nama",namaguru:"Nama",fullname:"Nama",nik:"NIK",mapel:"Mapel",matapelajaran:"Mapel",mataajaran:"Mapel",jabatan:"Jabatan",status:"Status",email:"Email",surel:"Email",aktif:"Aktif",statusaktif:"Aktif",rppmodulajar:"RPP_ModulAjar",rpp:"RPP_ModulAjar",instrumenasesmen:"InstrumenAsesmen",asesmen:"InstrumenAsesmen",dokumentepatwaktu:"DokumenTepatWaktu"};
  return map[x]||String(h??"").trim();
}
async function handleGuruExcel(ev){
  const file=ev.target.files?.[0];ev.target.value="";if(!file)return;if(typeof XLSX==="undefined")return toast("Library Excel belum termuat.");
  try{toast("Membaca file Excel...");const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});if(!raw.length)throw new Error("File Excel kosong.");
    const allowed=cfg.guru[1],rows=raw.map(row=>{const o={};Object.keys(row).forEach(k=>{const nk=normalizeGuruHeader(k);if(allowed.includes(nk))o[nk]=String(row[k]??"").trim();});return o;}).filter(o=>o.NIP||o.Nama||o.NIK);if(!rows.length)throw new Error("Kolom NIP, Nama, atau NIK tidak ditemukan.");
    const unique=[],seen=new Set(),existing=new Set((D.guru||[]).map(r=>String(r.NIP||"").trim()).filter(Boolean));rows.forEach(o=>{const key=o.NIP||`NIK:${o.NIK}`||`NAMA:${o.Nama}`;if(key&&!seen.has(key)&&(!o.NIP||!existing.has(o.NIP))){seen.add(key);unique.push(o);}});if(!unique.length)throw new Error("Tidak ada data baru.");
    for(let i=0;i<unique.length;i+=10){const chunk=unique.slice(i,i+10);const res=await api("bulkSave",{name:"GURU",data:chunk});toast(`Mengupload ${Math.min(i+chunk.length,unique.length)} / ${unique.length}...`);}
    D=await api("data");guruPage();toast(`${unique.length} data guru selesai diproses.`);
  }catch(e){toast(e.message||"Upload Excel gagal.");}
}
function inputFor(p,c){
  const long=['Deskripsi','Catatan','Temuan','RencanaAksi','Masalah','DataPendukung','Keputusan','TindakLanjut'];
  if(c==="Guru"||c==="PenanggungJawab"||c==="Supervisor"){
    const names=(D.guru||[]).map(x=>x.Nama).filter(Boolean);
    return `<select name="${esc(c)}"><option value="">-- Pilih --</option>${names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`;
  }
  if(["Status"].includes(c))return `<select name="${esc(c)}"><option value="">-- Pilih Status --</option><option>Belum Mulai</option><option>Proses</option><option>Selesai</option><option>Terlambat</option><option>Ditindaklanjuti</option></select>`;
  if(["RPP_ModulAjar","InstrumenAsesmen","DokumenTepatWaktu"].includes(c))return `<select name="${esc(c)}"><option value="">-- Pilih --</option><option>Ya</option><option>Tidak</option></select>`;
  if(c==="Predikat")return `<input name="${esc(c)}" value="" placeholder="Otomatis dari nilai" readonly>`;
  if(["Nilai","NilaiDampak","Bobot","SkalaMin","SkalaMax","Progress","Persentase","Target","Realisasi","Anggaran"].includes(c))
    return `<input name="${esc(c)}" type="number" min="0" max="${["Bobot","SkalaMin","SkalaMax","Nilai","NilaiDampak","Progress","Persentase"].includes(c)?100:""}" step="0.01" placeholder="${c==="Progress"||c==="Persentase"?"0–100":""}">`;
  if(["Tanggal","Mulai","Selesai","TargetSelesai","Deadline"].includes(c))return `<input name="${esc(c)}" type="date">`;
  if(long.includes(c))return `<textarea name="${esc(c)}"></textarea>`;
  return `<input name="${esc(c)}" type="text">`;
}
function form(p,sheet){
  const cols=cfg[p][1], skip=["ID","Predikat"];
  document.getElementById("formbox").innerHTML=`<h2>Input ${esc(pageTitle(p))}</h2><div class="score-guide">Predikat otomatis: <b>90–100 Sangat Baik</b> · <b>80–89 Baik</b> · <b>70–79 Cukup</b> · <b>&lt;70 Perlu Perbaikan</b></div><form id="f" class="form">${cols.filter(c=>!skip.includes(c)).map(c=>`<div class="${["Catatan","Deskripsi","Temuan","RencanaAksi","Masalah","DataPendukung","Keputusan","TindakLanjut"].includes(c)?"full":""}"><label>${esc(c)}</label>${inputFor(p,c)}</div>`).join("")}</form><div style="text-align:right;margin-top:12px"><button class="btn" id="saveFormBtn">Simpan Penilaian</button></div>`;
  document.getElementById("modal").classList.add("on");document.getElementById("saveFormBtn").onclick=()=>save(sheet,p);
}
async function save(s,p){
  const fd=new FormData(document.getElementById("f")),o={};fd.forEach((v,k)=>o[k]=v);
  // predikat ditampilkan di tabel; backend menghitung otomatis.
  const btn=document.getElementById("saveFormBtn");btn.disabled=true;
  try{await api("save",{name:s,data:o});closeM();D=await api("data");crud(p);toast("Penilaian berhasil disimpan.");}catch(e){toast(e.message);}finally{btn.disabled=false;}
}
async function del(s,id,p){if(!confirm("Hapus data ini?"))return;try{await api("remove",{name:s,id});D=await api("data");crud(p);toast("Data berhasil dihapus");}catch(e){toast(e.message);}}
async function report(){
  const a=D.supervisi||[],m={};a.forEach(x=>{const k=x.Guru||"Tanpa nama";m[k]??={n:0,s:0};m[k].n++;m[k].s+=+x.Nilai||0;});
  const rows=Object.entries(m).map(([Guru,v])=>({Guru,Observasi:v.n,RataRata:Number((v.s/v.n).toFixed(2)),Predikat:scoreLabel(v.s/v.n)}));
  document.getElementById("view").innerHTML=`<div class="panel"><div class="toolbar"><div><b>Laporan & Rekap Penilaian</b><div class="muted">Rekap rata-rata supervisi per guru</div></div><div><button class="btn gray" onclick="exportReportExcel()">Ekspor Excel</button><button class="btn gray" onclick="window.print()">Cetak / Simpan PDF</button></div></div>${rows.length?`<div class="table-wrap"><table><tr><th>Guru</th><th>Observasi</th><th>Rata-rata</th><th>Predikat</th></tr>${rows.map(r=>`<tr><td>${esc(r.Guru)}</td><td>${r.Observasi}</td><td>${r.RataRata}</td><td>${badge(r.Predikat)}</td></tr>`).join("")}</table></div>`:'<div class="empty">Belum ada data supervisi.</div>'}</div>`;
}
function exportReportExcel(){
  if(typeof XLSX==="undefined")return toast("Library Excel belum termuat.");
  const a=D.supervisi||[],m={};a.forEach(x=>{const k=x.Guru||"Tanpa nama";m[k]??={n:0,s:0};m[k].n++;m[k].s+=+x.Nilai||0;});
  const rows=Object.entries(m).map(([Guru,v])=>({Guru,Observasi:v.n,RataRata:Number((v.s/v.n).toFixed(2)),Predikat:scoreLabel(v.s/v.n)}));
  const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{Guru:"",Observasi:0,RataRata:0,Predikat:""}]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Laporan");XLSX.writeFile(wb,"Laporan_SMART_Kinerja.xlsx");
}
function settings(){
  const s=D.settings||{};document.getElementById("view").innerHTML=`<div class="panel"><h2>Identitas Sekolah</h2><form id="set" class="form"><div><label>Nama sekolah</label><input name="school_name" value="${esc(s.school_name)}"></div><div><label>Kepala sekolah</label><input name="school_head" value="${esc(s.school_head)}"></div><div class="full"><label>Alamat</label><textarea name="school_address">${esc(s.school_address)}</textarea></div><div><label>Semester</label><input name="semester" value="${esc(s.semester)}"></div><div><label>Tahun ajaran</label><input name="tahun_ajaran" value="${esc(s.tahun_ajaran)}"></div></form><div style="text-align:right;margin-top:12px"><button class="btn" onclick="setSave()">Simpan</button></div></div>`;
}
async function setSave(){const f=new FormData(document.getElementById("set")),o={};f.forEach((v,k)=>o[k]=v);try{await api("saveSettings",{data:o});D=await api("data");document.getElementById("school").textContent=D.settings?.school_name||"Sekolah Anda";toast("Pengaturan tersimpan");settings();}catch(e){toast(e.message);}}
function closeM(){document.getElementById("modal").classList.remove("on");}
document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.page,b)));
document.getElementById("refreshBtn").addEventListener("click",load);
document.getElementById("closeModal").addEventListener("click",closeM);
load();
