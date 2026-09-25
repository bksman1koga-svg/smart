/*
 * SMART Kinerja Sekolah - GitHub Pages frontend
 * Backend: Google Apps Script Web App using JSONP.
 *
 * SET THIS URL to your deployed Apps Script /exec URL.
 */
const API_URL = "https://script.google.com/macros/s/AKfycbywKtW_14eIQctf767ZkWih6LyQS1Dlj30DNYGCsPV2SGK5XPxLesQc9mPwntWP4fR1/exec";

let D = {};

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
    const callback = "__smartKinerja_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const query = new URLSearchParams({ action, callback, _: Date.now().toString() });

    Object.entries(params).forEach(([k,v]) => {
      if (v !== undefined && v !== null) {
        query.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      }
    });

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("Google Apps Script tidak merespons. Buka URL /exec langsung untuk mengecek deployment."));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timer);
      try { delete window[callback]; } catch(e) {}
      script.remove();
    };

    window[callback] = payload => {
      if (finished) return;
      finished = true;
      cleanup();
      if (payload && payload.ok === false) {
        reject(new Error(payload.error || "API error"));
      } else {
        resolve(payload?.data ?? payload);
      }
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("Web App Google Apps Script tidak bisa diakses. Pastikan deployment memakai Execute as: Me dan Who has access: Anyone, lalu gunakan URL /exec."));
    };

    script.src = API_URL + (API_URL.includes("?") ? "&" : "?") + query.toString();
    document.head.appendChild(script);
  });
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 2600);
}

async function load() {
  try {
    D = await api("data");
    document.getElementById("school").textContent = D.settings?.school_name || "Sekolah Anda";
    await dash();
  } catch (e) {
    document.getElementById("school").textContent = "API belum tersambung";
    document.getElementById("view").innerHTML =
      `<div class="panel error"><b>Koneksi belum berhasil.</b><p>${esc(e.message)}</p>
       <div class="api-note">Isi API_URL di script.js dengan URL Web App Google Apps Script yang berakhiran /exec, lalu upload ulang ke GitHub Pages.</div></div>`;
  }
}

async function show(p, b) {
  document.querySelectorAll(".nav button").forEach(x => x.classList.remove("active"));
  b?.classList.add("active");
  document.getElementById("title").textContent =
    p === "dashboard" ? "Dashboard" : p.replace(/^./, x => x.toUpperCase());
  try {
    if (p === "dashboard") await dash();
    else if (p === "laporan") await report();
    else if (p === "pengaturan") settings();
    else crud(p);
  } catch (e) {
    document.getElementById("view").innerHTML = `<div class="panel error">${esc(e.message)}</div>`;
  }
}

async function dash() {
  const x = await api("dashboard");
  document.getElementById("view").innerHTML = `
    <div class="grid">
      <div class="card kpi">Guru terdaftar<div class="n">${esc(x.guru)}</div></div>
      <div class="card kpi">Rata-rata supervisi<div class="n">${esc(x.avg)}</div></div>
      <div class="card kpi">Program selesai<div class="n">${esc(x.program)}</div></div>
      <div class="card kpi">Pembinaan terbuka<div class="n">${esc(x.pembinaan)}</div></div>
    </div>
    <div class="panel" style="margin-top:15px">
      <b>Alur kerja</b>
      <p class="muted">Indikator → Supervisi → Monitoring → Pembinaan → Keputusan → Laporan.</p>
    </div>`;
}

function crud(p) {
  const [sheet, cols] = cfg[p], arr = D[p] || [];
  if (p === 'guru') return guruPage();
  document.getElementById("view").innerHTML = `
    <div class="panel">
      <div class="toolbar"><b>${esc(p)}</b><button class="btn" onclick="form('${p}','${sheet}')">+ Tambah</button></div>
      ${arr.length ? `<div class="table-wrap"><table><tr><th>ID</th>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}<th></th></tr>
      ${arr.map(r=>`<tr><td>${esc(r.ID)}</td>${cols.map(c=>`<td>${esc(r[c])}</td>`).join("")}
      <td><button class="btn red" onclick="del('${sheet}','${esc(r.ID)}','${p}')">Hapus</button></td></tr>`).join("")}
      </table></div>` : '<div class="empty">Belum ada data.</div>'}
    </div>`;
}

function guruPage() {
  const arr = D.guru || [];
  document.getElementById("view").innerHTML = `
    <div class="panel">
      <div class="toolbar guru-toolbar">
        <div><b>Data Guru</b><div class="muted">${arr.length} data guru</div></div>
        <div class="actions">
          <button class="btn gray" onclick="downloadGuruTemplate()">Template Excel</button>
          <label class="btn upload-btn">Upload Excel<input id="guruExcel" type="file" accept=".xlsx,.xls,.csv" hidden></label>
          <button class="btn" onclick="form('guru','GURU')">+ Tambah Guru</button>
        </div>
      </div>
      <div class="searchbar">
        <input id="guruSearch" type="search" placeholder="🔎 Cari NIP, nama, NIK, mapel, jabatan, status..." autocomplete="off">
        <span class="muted" id="guruCount"></span>
      </div>
      <div id="guruTable"></div>
    </div>`;
  document.getElementById('guruSearch').addEventListener('input', renderGuruTable);
  document.getElementById('guruExcel').addEventListener('change', handleGuruExcel);
  renderGuruTable();
}

function renderGuruTable() {
  const arr = D.guru || [];
  const q = (document.getElementById('guruSearch')?.value || '').trim().toLowerCase();
  const filtered = !q ? arr : arr.filter(r => ['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif']
    .some(k => String(r[k] ?? '').toLowerCase().includes(q)));
  const el = document.getElementById('guruTable');
  const count = document.getElementById('guruCount');
  if (count) count.textContent = `Menampilkan ${filtered.length} dari ${arr.length}`;
  if (!el) return;
  el.innerHTML = filtered.length ? `<div class="table-wrap"><table><tr><th>ID</th>${cfg.guru[1].map(c=>`<th>${esc(c)}</th>`).join('')}<th>Aksi</th></tr>
    ${filtered.map(r=>`<tr><td>${esc(r.ID)}</td>${cfg.guru[1].map(c=>`<td>${esc(r[c])}</td>`).join('')}
      <td><button class="btn red" onclick="del('GURU','${esc(r.ID)}','guru')">Hapus</button></td></tr>`).join('')}</table></div>`
    : '<div class="empty">Data guru tidak ditemukan.</div>';
}

function downloadGuruTemplate() {
  const headers = ['NIP','Nama','NIK','Mapel','Jabatan','Status','Email','Aktif'];
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat. Refresh halaman lalu coba lagi.');
  const ws = XLSX.utils.aoa_to_sheet([headers, ['197001012000000000','Contoh Nama Guru','1800000000000000','Matematika','Guru','Aktif','guru@sekolah.sch.id','Ya']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');
  XLSX.writeFile(wb, 'Template_Data_Guru_SMART_Kinerja.xlsx');
}

function normalizeGuruHeader(h) {
  const x = String(h ?? '').trim().toLowerCase().replace(/[\s_\-./]+/g,'');
  const map = {
    nip:'NIP', nomorindukpegawai:'NIP', nipguru:'NIP',
    nama:'Nama', namaguru:'Nama', fullname:'Nama',
    nik:'NIK',
    mapel:'Mapel', matapelajaran:'Mapel', mataajaran:'Mapel',
    jabatan:'Jabatan',
    status:'Status',
    email:'Email', surel:'Email',
    aktif:'Aktif', statusaktif:'Aktif'
  };
  return map[x] || String(h ?? '').trim();
}

async function handleGuruExcel(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  if (typeof XLSX === 'undefined') return toast('Library Excel belum termuat. Refresh halaman lalu coba lagi.');
  try {
    toast('Membaca file Excel...');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});
    if (!raw.length) throw new Error('File Excel kosong atau baris data tidak ditemukan.');
    const allowed = cfg.guru[1];
    const rows = raw.map(row => {
      const o = {};
      Object.keys(row).forEach(k => {
        const nk = normalizeGuruHeader(k);
        if (allowed.includes(nk)) o[nk] = String(row[k] ?? '').trim();
      });
      return o;
    }).filter(o => o.NIP || o.Nama || o.NIK);
    if (!rows.length) throw new Error('Kolom NIP, Nama, atau NIK tidak ditemukan. Gunakan Template Excel.');
    const unique = [];
    const seen = new Set();
    const existing = new Set((D.guru || []).map(r => String(r.NIP || '').trim()).filter(Boolean));
    rows.forEach(o => {
      const key = o.NIP || `NIK:${o.NIK}` || `NAMA:${o.Nama}`;
      if (key && !seen.has(key) && (!o.NIP || !existing.has(o.NIP))) {
        seen.add(key); unique.push(o);
      }
    });
    if (!unique.length) throw new Error('Tidak ada data baru. NIP yang diupload mungkin sudah ada.');
    const chunkSize = 10;
    let added = 0;
    for (let i=0; i<unique.length; i+=chunkSize) {
      const chunk = unique.slice(i, i+chunkSize);
      await api('bulkSave', {name:'GURU', data:chunk});
      added += chunk.length;
      toast(`Mengupload ${Math.min(i+chunk.length, unique.length)} / ${unique.length}...`);
    }
    D = await api('data');
    guruPage();
    toast(`${added} data guru berhasil diupload.`);
  } catch(e) {
    toast(e.message || 'Upload Excel gagal.');
  }
}

function form(p, sheet) {
  const cols = cfg[p][1];
  const longFields = ['Catatan','Deskripsi','Temuan','RencanaAksi','Masalah','DataPendukung','Keputusan','TindakLanjut'];
  document.getElementById("formbox").innerHTML = `
    <h2>Tambah ${esc(p)}</h2>
    <form id="f" class="form">
      ${cols.map(c => `<div class="${longFields.includes(c) ? 'full' : ''}">
        <label>${esc(c)}</label>
        ${longFields.includes(c)
          ? `<textarea name="${esc(c)}"></textarea>`
          : `<input name="${esc(c)}" type="${
              ['Tanggal','Mulai','Selesai','TargetSelesai','Deadline'].includes(c) ? 'date' :
              ['Bobot','SkalaMin','SkalaMax','Nilai','Progress','Anggaran'].includes(c) ? 'number' : 'text'
            }">`}
      </div>`).join("")}
    </form>
    <div style="text-align:right;margin-top:12px"><button class="btn" id="saveFormBtn">Simpan</button></div>`;
  document.getElementById("modal").classList.add("on");
  document.getElementById("saveFormBtn").onclick = () => save(sheet, p);
}

async function save(s, p) {
  const fd = new FormData(document.getElementById("f")), o = {};
  fd.forEach((v,k) => o[k] = v);
  const btn = document.getElementById("saveFormBtn");
  btn.disabled = true;
  try {
    await api("save", {name:s, data:o});
    closeM();
    D = await api("data");
    crud(p);
    toast("Data berhasil disimpan");
  } catch(e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function del(s, id, p) {
  if (!confirm("Hapus data ini?")) return;
  try {
    await api("remove", {name:s, id});
    D = await api("data");
    crud(p);
    toast("Data berhasil dihapus");
  } catch(e) { toast(e.message); }
}

async function report() {
  const a = D.supervisi || [], m = {};
  a.forEach(x => {
    const k = x.Guru || "Tanpa nama";
    m[k] ??= {n:0,s:0};
    m[k].n++;
    m[k].s += +x.Nilai || 0;
  });
  document.getElementById("view").innerHTML = `
    <div class="panel">
      <div class="toolbar"><b>Rekap Supervisi</b><button class="btn gray" onclick="window.print()">Cetak</button></div>
      ${Object.keys(m).length ? `<div class="table-wrap"><table><tr><th>Guru</th><th>Observasi</th><th>Rata-rata</th></tr>
      ${Object.entries(m).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.n}</td><td>${(v.s/v.n).toFixed(2)}</td></tr>`).join("")}</table></div>`
      : '<div class="empty">Belum ada data supervisi.</div>'}
    </div>`;
}

function settings() {
  const s = D.settings || {};
  document.getElementById("view").innerHTML = `
    <div class="panel">
      <h2>Identitas Sekolah</h2>
      <form id="set" class="form">
        <div><label>Nama sekolah</label><input name="school_name" value="${esc(s.school_name)}"></div>
        <div><label>Kepala sekolah</label><input name="school_head" value="${esc(s.school_head)}"></div>
        <div class="full"><label>Alamat</label><textarea name="school_address">${esc(s.school_address)}</textarea></div>
        <div><label>Semester</label><input name="semester" value="${esc(s.semester)}"></div>
        <div><label>Tahun ajaran</label><input name="tahun_ajaran" value="${esc(s.tahun_ajaran)}"></div>
      </form>
      <div style="text-align:right;margin-top:12px"><button class="btn" onclick="setSave()">Simpan</button></div>
    </div>`;
}

async function setSave() {
  const f = new FormData(document.getElementById("set")), o = {};
  f.forEach((v,k) => o[k] = v);
  try {
    await api("saveSettings", {data:o});
    D = await api("data");
    document.getElementById("school").textContent = D.settings?.school_name || "Sekolah Anda";
    toast("Pengaturan tersimpan");
    settings();
  } catch(e) { toast(e.message); }
}

function closeM() { document.getElementById("modal").classList.remove("on"); }

document.querySelectorAll(".nav button").forEach(b => {
  b.addEventListener("click", () => show(b.dataset.page, b));
});
document.getElementById("refreshBtn").addEventListener("click", load);
document.getElementById("closeModal").addEventListener("click", closeM);

load();
