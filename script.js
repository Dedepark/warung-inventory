// --- INISIALISASI SUPABASE ---
const SUPABASE_URL = 'https://ftfuhffjqppksecdrspl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZnVoZmZqcXBwa3NlY2Ryc3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMTcwNzcsImV4cCI6MjA3ODU5MzA3N30.unTDoXFJPaavRwxNmRkAZgNRTn_-qYaSBalaHGo6pGU';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- STATE GLOBAL ---
let keranjang = [];
let isScannerActive = false;
let codeReader = null;

// --- FUNGSI UTILITAS ---
function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);
}
function showAlert(message) {
    alert(message);
}

// --- MANAJEMEN VIEW ---
function tampilkanView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    document.getElementById(`${viewName}-view`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
}

// --- FITUR INVENTARIS ---
async function tampilkanInventaris() {
    const tabelBody = document.querySelector('#tabel-inventaris tbody');
    tabelBody.innerHTML = '<tr><td colspan="5">Memuat...</td></tr>';
    const { data, error } = await supabase.from('inventaris').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); showAlert('Gagal memuat data.'); return; }
    tabelBody.innerHTML = '';
    if (data.length === 0) { tabelBody.innerHTML = '<tr><td colspan="5">Belum ada barang.</td></tr>'; return; }
    data.forEach(barang => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${barang.nama_barang}</td><td>${barang.barcode || '-'}</td><td>${formatRupiah(barang.harga_jual)}</td><td>${barang.stok}</td><td><button onclick="restokBarang(${barang.id})">Restok</button><button onclick="hapusBarang(${barang.id})" style="background-color: var(--danger-color);">Hapus</button></td>`;
        tabelBody.appendChild(row);
    });
}
async function tambahBarang(e) {
    e.preventDefault();
    const form = e.target;
    const { error } = await supabase.from('inventaris').insert([{ nama_barang: form['input-nama'].value, barcode: form['input-barcode'].value, harga_jual: parseFloat(form['input-harga'].value), stok: parseInt(form['input-stok'].value) }]);
    if (error) { showAlert(error.message); } else { showAlert('Barang ditambahkan!'); form.reset(); tampilkanInventaris(); }
}
async function restokBarang(id) {
    const j = prompt("Jumlah stok ditambah:"); if (!j || isNaN(j) || parseInt(j) <= 0) return;
    const { data: b } = await supabase.from('inventaris').select('stok').eq('id', id).single();
    if (!b) { showAlert('Gagal ambil data stok.'); return; }
    const { error } = await supabase.from('inventaris').update({ stok: b.stok + parseInt(j) }).eq('id', id);
    if (error) { showAlert('Gagal restok.'); } else { showAlert(`Stok ditambah ${j}.`); tampilkanInventaris(); }
}
async function hapusBarang(id) {
    if (!confirm('Yakin hapus?')) return;
    const { error } = await supabase.from('inventaris').delete().eq('id', id);
    if (error) { showAlert('Gagal hapus.'); } else { showAlert('Barang dihapus.'); tampilkanInventaris(); }
}

// --- FITUR KASIR & SCANNER (ZXING) ---
async function prosesBarangTerscan(bc) {
    console.log('ZXing membaca barcode:', bc);
    showAlert(`Mencari barcode: ${bc}`);
    const { data: barang, error } = await supabase.from('inventaris').select('*').eq('barcode', bc).single();
    if (error || !barang) { showAlert(`Barcode ${bc} tidak ditemukan!`); return; }
    if (barang.stok <= 0) { showAlert(`Stok ${barang.nama_barang} habis!`); return; }
    const item = keranjang.find(i => i.id === barang.id);
    if (item) { item.jumlah++; } else { keranjang.push({ ...barang, jumlah: 1 }); }
    updateTampilanKeranjang();
}
function updateTampilanKeranjang() {
    const list = document.getElementById('cart-list'); const totalEl = document.getElementById('cart-total');
    if (keranjang.length === 0) { list.innerHTML = '<li>Kosong.</li>'; totalEl.textContent = '0.00'; return; }
    list.innerHTML = ''; let total = 0;
    keranjang.forEach(item => { const sub = item.harga_jual * item.jumlah; total += sub; list.innerHTML += `<li><span>${item.nama_barang} (x${item.jumlah})</span><span>${formatRupiah(sub)}</span></li>`; });
    totalEl.textContent = total.toFixed(2).replace('.', ',');
}

async function toggleScanner() {
    if (isScannerActive) {
        console.log("Menghentikan scanner ZXing...");
        if (codeReader) {
            await codeReader.reset();
        }
        isScannerActive = false;
        document.getElementById('btn-toggle-scanner').textContent = '📷 Mulai Scan';
        document.getElementById('scanner-container').innerHTML = '<p>Klik tombol untuk mulai.</p>';
    } else {
        console.log("Memulai scanner ZXing...");
        document.getElementById('scanner-container').innerHTML = '<video id="video-zxing"></video>';
        const videoElement = document.getElementById('video-zxing');
        
        codeReader = new ZXing.BrowserMultiFormatReader();
        codeReader.decodeFromVideoDevice(undefined, videoElement, (result, err) => {
            if (result) {
                console.log('ZXing berhasil mendeteksi:', result.text);
                // Hentikan scanner agar tidak double scan
                toggleScanner(); 
                prosesBarangTerscan(result.text);
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error(err);
            }
        });
        isScannerActive = true;
        document.getElementById('btn-toggle-scanner').textContent = '⏹️ Hentikan Scan';
    }
}

async function bayar() {
    if (keranjang.length === 0) { showAlert('Keranjang kosong!'); return; }
    const total = keranjang.reduce((t, i) => t + (i.harga_jual * i.jumlah), 0);
    const items = keranjang.map(i => ({ id: i.id, nama_barang: i.nama_barang, jumlah: i.jumlah, harga_satuan: i.harga_jual }));
    const { error: tErr } = await supabase.from('transaksi').insert([{ items, total_harga: total }]);
    if (tErr) { showAlert('Gagal simpan transaksi.'); return; }
    for (const i of keranjang) {
        const { data: b } = await supabase.from('inventaris').select('stok').eq('id', i.id).single();
        await supabase.from('inventaris').update({ stok: b.stok - i.jumlah }).eq('id', i.id);
    }
    showAlert(`Pembayaran berhasil! Total: ${formatRupiah(total)}`);
    keranjang = []; updateTampilanKeranjang(); tampilkanInventaris();
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-inventaris').addEventListener('click', () => tampilkanView('inventaris'));
    document.getElementById('nav-kasir').addEventListener('click', () => tampilkanView('kasir'));
    document.getElementById('form-tambah-barang').addEventListener('submit', tambahBarang);
    document.getElementById('btn-toggle-scanner').addEventListener('click', toggleScanner);
    document.getElementById('btn-bayar').addEventListener('click', bayar);
    document.getElementById('btn-scan-barcode-tambah').addEventListener('click', () => { const bc = prompt('Masukkan barcode manual:'); if (bc) document.getElementById('input-barcode').value = bc; });
    tampilkanInventaris(); updateTampilanKeranjang();
});