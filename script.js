/*
 * SMART Kinerja Sekolah - FIX INTERAKSI V3
 * Frontend GitHub Pages / Vercel + Google Apps Script JSONP.
 */
const API_URL = "https://script.google.com/macros/s/AKfycbywKtW_14eIQctf767ZkWih6LyQS1Dlj30DNYGCsPV2SGK5XPxLesQc9mPwntWP4fR1/exec";

let D = {};
let currentPage = 'dashboard';

const cfg = {
  guru:['GURU',['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif']],
  indikator:['INDIKATOR',['Kategori','Indikator','Bobot','SkalaMin','SkalaMax','Deskripsi']],
  supervisi:['SUPERVISI',['Tanggal','Guru','Supervisor','Periode','Indikator','Nilai','Catatan','TindakLanjut']],
  program:['PROGRAM',['NamaProgram','PenanggungJawab','Mulai','Selesai','Target','Realisasi','Status','Anggaran','Catatan']],
  monitoring:['MONITORING',['Tanggal','Jenis','Objek','PenanggungJawab','Progress','Status','Catatan','TindakLanjut']],
  pembinaan:['PEMBINAAN',['Tanggal','Guru','Topik','Temuan','RencanaAksi','TargetSelesai','Status','Catatan']],
  keputusan:['KEPUTUSAN',['Tanggal','Bidang','Masalah','DataPendukung','Keputusan','PenanggungJawab','Deadline','Status','Catatan']]
};

const esc = x => String(x ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[m]));

function ensureApi() {
  if (!API_URL || !/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec(?:\?.*)?$/.test(API_URL)) {
    throw new Error('API_URL belum diisi dengan URL Web App Google Apps Script yang berakhiran /exec.');
  }
}

function api(action, params = {}) {
  ensureApi();
  return new Promise((resolve, reject) => {
    const callback = '__smartKinerja_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const query = new URLSearchParams({action, callback, _: String(Date.now())});
    Object.entries(params).forEach(([k,v]) => {
      if (v !== undefined && v !== null) query.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });

    let finished = false;
    const cleanup = () => {
      clearTimeout(timer);
      try { delete window[callback]; } catch (_) {}
      script.remove();
    };
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Google Apps Script tidak merespons dalam 15 detik. Cek deployment /exec: Execute as Me dan akses Anyone.'));
    }, 15000);

    window[callback] = payload => {
      if (finished) return;
      finished = true;
      cleanup();
      if (payload && payload.ok === false) reject(new Error(payload.error || 'API error'));
      else resolve(payload?.data ?? payload);
    };
    script.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Web App Google Apps Script tidak bisa diakses. Pastikan deployment memakai Execute as: Me dan Who has access: Anyone, lalu gunakan URL /exec.'));
    };
    script.async = true;
    script.src = API_URL + (API_URL.includes('?') ? '&' : '?') + query.toString();
    document.head.appendChild(script);
  });
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('on'), 3000);
}

async function load() {
  try {
    D = await api('data');
    document.getElementById('school').textContent = D.settings?.school_name || 'SMAN 1 Kota Gajah';
    await dash();
    toast('Koneksi API berhasil.');
  } catch (e) {
    D = D || {};
    document.getElementById('school').textContent = 'API belum tersambung';
    document.getElementById('view').innerHTML = `
      <div class="panel error">
        <b>Koneksi Google Apps Script belum berhasil.</b>
        <p>${esc(e.message)}</p>
        <div class="api-note">Menu tetap dapat dibuka. Setelah deployment Apps Script benar, klik Refresh.</div>
      </div>`;
  }
}

async function show(p, b) {
  currentPage = p;
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x === b));
  document.getElementById('title').textContent = pageTitle(p);
  try {
    if (p === 'dashboard') await dash();
    else if (p === 'laporan') report();
    else if (p === 'pengaturan') settings();
    else crud(p);
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="panel error">${esc(e.message)}</div>`;
  }
}

function pageTitle(p) {
  return ({dashboard:'Dashboard',guru:'Data Guru',indikator:'Indikator Kinerja',supervisi:'Supervisi Kelas',program:'Program Sekolah',monitoring:'Monitoring',pembinaan:'Pembinaan Guru',keputusan:'Keputusan Berbasis Data',laporan:'Laporan',pengaturan:'Pengaturan'})[p] || 'SMART Kinerja';
}

async function dash() {
  const x = await api('dashboard');
  document.getElementById('view').innerHTML = `
    <div class="grid">
      <div class="card kpi">Guru terdaftar<div class="n">${esc(x.guru)}</div></div>
      <div class="card kpi">Rata-rata supervisi<div class="n">${esc(x.avg)}</div></div>
      <div class="card kpi">Program selesai<div class="n">${esc(x.program)}</div></div>
      <div class="card kpi">Pembinaan terbuka<div class="n">${esc(x.pembinaan)}</div></div>
    </div>
    <div class="panel" style="margin-top:15px"><b>Alur kerja</b><p class="muted">Indikator → Supervisi → Monitoring → Pembinaan → Keputusan → Laporan.</p></div>`;
}

function crud(p) {
  if (!cfg[p]) throw new Error('Menu tidak dikenali: ' + p);
  const [sheet, cols] = cfg[p], arr = D[p] || [];
  if (p === 'guru') return guruPage();
  const addLabel = p === 'indikator' ? 'Tambah Indikator' : p === 'supervisi' ? 'Tambah Penilaian Supervisi' : '+ Tambah';
  document.getElementById('view').innerHTML = `
    <div class="panel">
      <div class="toolbar"><div><b>${esc(pageTitle(p))}</b><div class="muted">${arr.length} data tersimpan</div></div><button class="btn" data-action="add" data-page="${p}">${esc(addLabel)}</button></div>
      ${arr.length ? `<div class="table-wrap"><table><tr><th>ID</th>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th>Aksi</th></tr>
      ${arr.map(r=>`<tr><td>${esc(r.ID)}</td>${cols.map(c=>`<td>${esc(r[c])}</td>`).join('')}<td><button class="btn red" data-action="delete" data-sheet="${sheet}" data-id="${esc(r.ID)}" data-page="${p}">Hapus</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Belum ada data. Gunakan tombol Tambah untuk memasukkan data.</div>'}
    </div>`;
}

function guruPage() {
  const arr = D.guru || [];
  document.getElementById('view').innerHTML = `
    <div class="panel">
      <div class="toolbar guru-toolbar">
        <div><b>Data Guru</b><div class="muted">${arr.length} data guru</div></div>
        <div class="actions">
          <button class="btn gray" data-action="template-guru">Template Excel</button>
          <label class="btn upload-btn">Upload Excel<input id="guruExcel" type="file" accept=".xlsx,.xls,.csv" hidden></label>
          <button class="btn" data-action="add-guru">+ Tambah Guru</button>
        </div>
      </div>
      <div class="searchbar"><input id="guruSearch" type="search" placeholder="🔎 Cari NIP, nama, NIK, mapel, jabatan, status..." autocomplete="off"><span class="muted" id="guruCount"></span></div>
      <div id="guruTable"></div>
    </div>`;
  document.getElementById('guruSearch').addEventListener('input', renderGuruTable);
  document.getElementById('guruExcel').addEventListener('change', handleGuruExcel);
  renderGuruTable();
}

function renderGuruTable() {
  const arr = D.guru || [];
  const q = (document.getElementById('guruSearch')?.value || '').trim().toLowerCase();
  const filtered = !q ? arr : arr.filter(r => ['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif'].some(k => String(r[k] ?? '').toLowerCase().includes(q)));
  const el = document.getElementById('guruTable'), count = document.getElementById('guruCount');
  if (count) count.textContent = `Menampilkan ${filtered.length} dari ${arr.length}`;
  if (!el) return;
  el.innerHTML = filtered.length ? `<div class="table-wrap"><table><tr><th>ID</th>${cfg.guru[1].map(c=>`<th>${esc(c)}</th>`).join('')}<th>Aksi</th></tr>${filtered.map(r=>`<tr><td>${esc(r.ID)}</td>${cfg.guru[1].map(c=>`<td>${esc(r[c])}</td>`).join('')}<td><button class="btn red" data-action="delete" data-sheet="GURU" data-id="${esc(r.ID)}" data-page="guru">Hapus</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Data guru tidak ditemukan.</div>';
}

function downloadGuruTemplate() {
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat. Refresh halaman lalu coba lagi.');
  const ws = XLSX.utils.aoa_to_sheet([['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif'],['197001012000000000','Contoh Nama Guru','1800000000000000','Matematika','Guru','Aktif','guru@sekolah.sch.id','Ya']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');
  XLSX.writeFile(wb, 'Template_Data_Guru_SMART_Kinerja.xlsx');
}

function normalizeGuruHeader(h) {
  const x = String(h ?? '').trim().toLowerCase().replace(/[\s_\-./]+/g,'');
  const map = {nip:'NIP',nomorindukpegawai:'NIP',nipguru:'NIP',nama:'Nama',namaguru:'Nama',fullname:'Nama',nik:'NIK',mapel:'Mapel',matapelajaran:'Mapel',mataajaran:'Mapel',jabatan:'Jabatan',status:'Status',email:'Email',surel:'Email',aktif:'Aktif',statusaktif:'Aktif'};
  return map[x] || String(h ?? '').trim();
}

async function handleGuruExcel(ev) {
  const file = ev.target.files?.[0]; ev.target.value = ''; if (!file) return;
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat. Refresh halaman lalu coba lagi.');
  try {
    toast('Membaca file Excel...');
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'}), ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});
    if (!raw.length) throw new Error('File Excel kosong atau baris data tidak ditemukan.');
    const allowed = cfg.guru[1];
    const rows = raw.map(row => { const o={}; Object.keys(row).forEach(k=>{const nk=normalizeGuruHeader(k); if(allowed.includes(nk)) o[nk]=String(row[k]??'').trim();}); return o; }).filter(o=>o.NIP||o.Nama||o.NIK);
    if (!rows.length) throw new Error('Kolom NIP, Nama, atau NIK tidak ditemukan. Gunakan Template Excel.');
    const unique=[], seen=new Set(), existing=new Set((D.guru||[]).map(r=>String(r.NIP||'').trim()).filter(Boolean));
    rows.forEach(o=>{const key=o.NIP||('NIK:'+o.NIK)||('NAMA:'+o.Nama); if(key&&!seen.has(key)&&(!o.NIP||!existing.has(o.NIP))){seen.add(key);unique.push(o);}});
    if (!unique.length) throw new Error('Tidak ada data baru. NIP yang diupload mungkin sudah ada.');
    let added=0;
    for(let i=0;i<unique.length;i+=10){const chunk=unique.slice(i,i+10); const r=await api('bulkSave',{name:'GURU',data:chunk}); added+=Number(r?.added||chunk.length); toast(`Mengupload ${Math.min(i+chunk.length,unique.length)} / ${unique.length}...`);}
    D=await api('data'); guruPage(); toast(`${added} data guru berhasil diupload.`);
  } catch(e) { toast(e.message||'Upload Excel gagal.'); }
}

function fieldControl(p, c) {
  const lower = c.toLowerCase();
  if (c === 'Guru') {
    const teachers=(D.guru||[]).map(x=>x.Nama).filter(Boolean);
    return teachers.length ? `<select name="Guru"><option value="">Pilih guru</option>${teachers.map(x=>`<option>${esc(x)}</option>`).join('')}</select>` : `<input name="Guru" placeholder="Nama guru">`;
  }
  if (c === 'Supervisor' || c === 'PenanggungJawab') {
    const teachers=(D.guru||[]).map(x=>x.Nama).filter(Boolean);
    return teachers.length ? `<select name="${esc(c)}"><option value="">Pilih nama</option>${teachers.map(x=>`<option>${esc(x)}</option>`).join('')}</select>` : `<input name="${esc(c)}">`;
  }
  if (c === 'Indikator' && (D.indikator||[]).length) return `<select name="Indikator"><option value="">Pilih indikator</option>${D.indikator.map(x=>`<option>${esc(x.Indikator)}</option>`).join('')}</select>`;
  if (c === 'Status') return `<select name="Status"><option value="">Pilih status</option><option>Aktif</option><option>Proses</option><option>Selesai</option><option>Belum Mulai</option><option>Perlu Tindak Lanjut</option></select>`;
  if (c === 'Aktif') return `<select name="Aktif"><option>Ya</option><option>Tidak</option></select>`;
  if (c === 'Nilai') return `<input name="Nilai" type="number" min="0" max="100" step="0.01" placeholder="0-100">`;
  if (c === 'Bobot' || c === 'SkalaMin' || c === 'SkalaMax') return `<input name="${esc(c)}" type="number" min="0" max="100" step="0.01">`;
  if (c === 'Progress') return `<input name="Progress" type="number" min="0" max="100" step="1" placeholder="0-100%">`;
  if (['Tanggal','Mulai','Selesai','TargetSelesai','Deadline'].includes(c)) return `<input name="${esc(c)}" type="date">`;
  if (['Anggaran'].includes(c)) return `<input name="Anggaran" type="number" min="0" step="1000" placeholder="Rp">`;
  const longFields=['Catatan','Deskripsi','Temuan','RencanaAksi','Masalah','DataPendukung','Keputusan','TindakLanjut','Topik'];
  if (longFields.includes(c)) return `<textarea name="${esc(c)}" rows="3"></textarea>`;
  return `<input name="${esc(c)}" type="text">`;
}

function form(p, sheet) {
  if (!cfg[p]) return toast('Menu tidak dikenali.');
  const cols=cfg[p][1];
  const title=p==='indikator'?'Tambah Indikator Kinerja':p==='supervisi'?'Tambah Penilaian Supervisi':p==='guru'?'Tambah Guru':`Tambah ${pageTitle(p)}`;
  document.getElementById('formbox').innerHTML=`<h2>${esc(title)}</h2><form id="f" class="form">${cols.map(c=>`<div class="${['Catatan','Deskripsi','Temuan','RencanaAksi','Masalah','DataPendukung','Keputusan','TindakLanjut','Topik'].includes(c)?'full':''}"><label>${esc(c)}</label>${fieldControl(p,c)}</div>`).join('')}</form><div style="text-align:right;margin-top:12px"><button class="btn" id="saveFormBtn" type="button">Simpan</button></div>`;
  document.getElementById('modal').classList.add('on');
  document.getElementById('saveFormBtn').onclick=()=>save(sheet,p);
  setTimeout(()=>document.querySelector('#f input, #f select, #f textarea')?.focus(),50);
}

async function save(s,p) {
  const f=document.getElementById('f'); if(!f)return;
  const fd=new FormData(f), o={}; fd.forEach((v,k)=>o[k]=String(v));
  const btn=document.getElementById('saveFormBtn'); btn.disabled=true; btn.textContent='Menyimpan...';
  try { await api('save',{name:s,data:o}); closeM(); D=await api('data'); crud(p); toast('Data berhasil disimpan.'); }
  catch(e){ toast(e.message||'Gagal menyimpan data.'); }
  finally{btn.disabled=false;btn.textContent='Simpan';}
}

async function del(s,id,p) {
  if(!confirm('Hapus data ini?'))return;
  try{await api('remove',{name:s,id});D=await api('data');crud(p);toast('Data berhasil dihapus.');}
  catch(e){toast(e.message||'Gagal menghapus data.');}
}

function report() {
  const a=D.supervisi||[], m={};
  a.forEach(x=>{const k=x.Guru||'Tanpa nama';m[k]??={n:0,s:0};m[k].n++;m[k].s+=+x.Nilai||0;});
  document.getElementById('view').innerHTML=`<div class="panel"><div class="toolbar"><b>Rekap Supervisi</b><button class="btn gray" data-action="print">Cetak</button></div>${Object.keys(m).length?`<div class="table-wrap"><table><tr><th>Guru</th><th>Observasi</th><th>Rata-rata</th></tr>${Object.entries(m).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.n}</td><td>${(v.s/v.n).toFixed(2)}</td></tr>`).join('')}</table></div>`:'<div class="empty">Belum ada data supervisi.</div>'}</div>`;
}

function settings() {
  const s=D.settings||{};
  document.getElementById('view').innerHTML=`<div class="panel"><h2>Identitas Sekolah</h2><form id="set" class="form"><div><label>Nama sekolah</label><input name="school_name" value="${esc(s.school_name)}"></div><div><label>Kepala sekolah</label><input name="school_head" value="${esc(s.school_head)}"></div><div class="full"><label>Alamat</label><textarea name="school_address">${esc(s.school_address)}</textarea></div><div><label>Semester</label><input name="semester" value="${esc(s.semester)}"></div><div><label>Tahun ajaran</label><input name="tahun_ajaran" value="${esc(s.tahun_ajaran)}"></div></form><div style="text-align:right;margin-top:12px"><button class="btn" data-action="save-settings">Simpan</button></div></div>`;
}

async function setSave(){
  const f=document.getElementById('set'),o={};new FormData(f).forEach((v,k)=>o[k]=String(v));
  try{await api('saveSettings',{data:o});D=await api('data');document.getElementById('school').textContent=D.settings?.school_name||'SMAN 1 Kota Gajah';toast('Pengaturan tersimpan.');settings();}
  catch(e){toast(e.message||'Gagal menyimpan pengaturan.');}
}

function closeM(){document.getElementById('modal').classList.remove('on');}

function handleAction(el){
  const action=el.dataset.action;
  if(action==='add') return form(el.dataset.page,cfg[el.dataset.page][0]);
  if(action==='add-guru') return form('guru','GURU');
  if(action==='template-guru') return downloadGuruTemplate();
  if(action==='delete') return del(el.dataset.sheet,el.dataset.id,el.dataset.page);
  if(action==='print') return window.print();
  if(action==='save-settings') return setSave();
}

document.addEventListener('click', e=>{
  const actionEl=e.target.closest('[data-action]');
  if(actionEl){e.preventDefault();handleAction(actionEl);return;}
  if(e.target.id==='modal') closeM();
});

document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>show(b.dataset.page,b)));
document.getElementById('refreshBtn').addEventListener('click',load);
document.getElementById('closeModal').addEventListener('click',closeM);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeM();});

load();
