// --- INISIALISASI SUPABASE ---
// PERINGATAN: Key ini akan segera di-revoke untuk keamanan!
const SUPABASE_URL = 'https://ftfuhffjqppksecdrspl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZnVoZmZqcXBwa3NlY2Ryc3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMTcwNzcsImV4cCI6MjA3ODU5MzA3N30.unTDoXFJPaavRwxNmRkAZgNRTn_-qYaSBalaHGo6pGU';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- STATE GLOBAL ---
let keranjang = [];
let isScannerActive = false;

// --- FUNGSI UTILITAS ---
function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);
}

function showAlert(message, type = 'info') {
    alert(message);
}

// --- MANAJEMEN VIEW ---
function tampilkanView(viewName) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${viewName}-view`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
}

// --- FITUR INVENTARIS ---
async function tampilkanInventaris() {
    const tabelBody = document.querySelector('#tabel-inventaris tbody');
    tabelBody.innerHTML = '<tr><td colspan="5">Memuat data...</td></tr>';
    const { data: inventaris, error } = await supabase.from('inventaris').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Gagal mengambil inventaris:', error); showAlert('Gagal memuat data.'); tabelBody.innerHTML = '<tr><td colspan="5">Gagal memuat data.</td></tr>'; return; }
    tabelBody.innerHTML = '';
    if (inventaris.length === 0) { tabelBody.innerHTML = '<tr><td colspan="5">Belum ada barang.</td></tr>'; return; }
    inventaris.forEach(barang => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${barang.nama_barang}</td><td>${barang.barcode || '-'}</td><td>${formatRupiah(barang.harga_jual)}</td><td>${barang.stok}</td><td><button onclick="restokBarang(${barang.id})">Restok</button><button onclick="hapusBarang(${barang.id})" style="background-color: var(--danger-color);">Hapus</button></td>`;
        tabelBody.appendChild(row);
    });
}

async function tambahBarang(event) {
    event.preventDefault();
    const form = event.target;
    const { error } = await supabase.from('inventaris').insert([{ nama_barang: form['input-nama'].value, barcode: form['input-barcode'].value, harga_jual: parseFloat(form['input-harga'].value), stok: parseInt(form['input-stok'].value), }]);
    if (error) { showAlert('Gagal menambah barang: ' + error.message); } else { showAlert('Barang berhasil ditambahkan!'); form.reset(); tampilkanInventaris(); }
}

async function restokBarang(id) {
    const jumlah = prompt("Masukkan jumlah stok yang ditambah:");
    if (!jumlah || isNaN(jumlah) || parseInt(jumlah) <= 0) return;
    const { data: barangSaatIni } = await supabase.from('inventaris').select('stok').eq('id', id).single();
    if (!barangSaatIni) { showAlert('Gagal mengambil data stok.'); return; }
    const stokBaru = barangSaatIni.stok + parseInt(jumlah);
    const { error } = await supabase.from('inventaris').update({ stok: stokBaru }).eq('id', id);
    if (error) { showAlert('Gagal melakukan restok.'); } else { showAlert(`Stok berhasil ditambah ${jumlah}. Total: ${stokBaru}`); tampilkanInventaris(); }
}

async function hapusBarang(id) {
    if (!confirm('Yakin ingin menghapus barang ini?')) return;
    const { error } = await supabase.from('inventaris').delete().eq('id', id);
    if (error) { showAlert('Gagal menghapus barang.'); } else { showAlert('Barang berhasil dihapus.'); tampilkanInventaris(); }
}

// --- FITUR KASIR & SCANNER ---
function onBarcodeDetected(result) {
    console.log('Quagga onDetected triggered:', result);
    if (!isScannerActive) return;
    if (!result || !result.codeResult) { console.warn('Tidak ada codeResult.'); return; }
    const scannedBarcode = result.codeResult.code;
    console.log('Barcode terdeteksi:', scannedBarcode);
    Quagga.stop(); isScannerActive = false;
    document.getElementById('btn-toggle-scanner').textContent = '📷 Mulai Scan';
    document.getElementById('scanner-container').innerHTML = '';
    prosesBarangTerscan(scannedBarcode);
}

async function prosesBarangTerscan(barcode) {
    showAlert(`Mencari barcode: ${barcode}`);
    const { data: barang, error } = await supabase.from('inventaris').select('*').eq('barcode', barcode).single();
    if (error || !barang) { showAlert(`Barang dengan barcode ${barcode} tidak ditemukan!`); return; }
    if (barang.stok <= 0) { showAlert(`Stok untuk ${barang.nama_barang} habis!`); return; }
    tambahKeKeranjang(barang);
}

function tambahKeKeranjang(barang) {
    const itemDiKeranjang = keranjang.find(item => item.id === barang.id);
    if (itemDiKeranjang) { if (itemDiKeranjang.jumlah < barang.stok) { itemDiKeranjang.jumlah++; } else { showAlert(`Stok ${itemDiKeranjang.nama_barang} tidak mencukupi!`); return; } }
    else { keranjang.push({ ...barang, jumlah: 1 }); }
    updateTampilanKeranjang();
}

function updateTampilanKeranjang() {
    const cartList = document.getElementById('cart-list'); const cartTotal = document.getElementById('cart-total');
    if (keranjang.length === 0) { cartList.innerHTML = '<li>Keranjang kosong.</li>'; cartTotal.textContent = '0.00'; return; }
    cartList.innerHTML = ''; let total = 0;
    keranjang.forEach(item => { const subtotal = item.harga_jual * item.jumlah; total += subtotal; const li = document.createElement('li'); li.innerHTML = `<span>${item.nama_barang} (x${item.jumlah})</span><span>${formatRupiah(subtotal)}</span>`; cartList.appendChild(li); });
    cartTotal.textContent = total.toFixed(2).replace('.', ',');
}

function initScanner() {
    console.log("Memulai inisialisasi Quagga...");
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#scanner-container'),
            constraints: {
                width: { min: 640, ideal: 1280 },
                height: { min: 480, ideal: 720 },
                facingMode: "environment"
            },
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: navigator.hardwareConcurrency || 4,
        decoder: {
            readers: ["ean_reader", "ean_8_reader", "code_128_reader", "code_39_reader", "upc_reader", "upc_e_reader"]
        },
        locate: true
    }, function(err) {
        if (err) { console.error('Quagga initialization failed:', err); showAlert('Gagal mengakses kamera. Pastikan izin diberikan.'); return; }
        console.log("Quagga berhasil diinisialisasi. Scanner dimulai.");
        Quagga.start(); isScannerActive = true;
        document.getElementById('btn-toggle-scanner').textContent = '⏹️ Hentikan Scan';
    });
}

function toggleScanner() {
    if (isScannerActive) {
        Quagga.stop(); isScannerActive = false;
        document.getElementById('btn-toggle-scanner').textContent = '📷 Mulai Scan';
        document.getElementById('scanner-container').innerHTML = '<p>Klik tombol di bawah untuk memulai scanner.</p>';
    } else { initScanner(); }
}

async function bayar() {
    if (keranjang.length === 0) { showAlert('Keranjang masih kosong!'); return; }
    const totalHarga = keranjang.reduce((total, item) => total + (item.harga_jual * item.jumlah), 0);
    const itemsToSave = keranjang.map(item => ({ id: item.id, nama_barang: item.nama_barang, jumlah: item.jumlah, harga_satuan: item.harga_jual }));
    const { error: transaksiError } = await supabase.from('transaksi').insert([{ items: itemsToSave, total_harga: totalHarga }]);
    if (transaksiError) { showAlert('Gagal menyimpan transaksi.'); return; }
    for (const item of keranjang) {
        const { data: barangSaatIni } = await supabase.from('inventaris').select('stok').eq('id', item.id).single();
        const { error: updateError } = await supabase.from('inventaris').update({ stok: barangSaatIni.stok - item.jumlah }).eq('id', item.id);
        if (updateError) console.error(`Gagal update stok:`, updateError);
    }
    showAlert(`Pembayaran berhasil! Total: ${formatRupiah(totalHarga)}`);
    keranjang = []; updateTampilanKeranjang(); tampilkanInventaris();
}

// --- EVENT LISTENERS & INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-inventaris').addEventListener('click', () => tampilkanView('inventaris'));
    document.getElementById('nav-kasir').addEventListener('click', () => tampilkanView('kasir'));
    document.getElementById('form-tambah-barang').addEventListener('submit', tambahBarang);
    document.getElementById('btn-toggle-scanner').addEventListener('click', toggleScanner);
    document.getElementById('btn-bayar').addEventListener('click', bayar);
    document.getElementById('btn-scan-barcode-tambah').addEventListener('click', () => { const barcode = prompt('Masukkan nomor barcode secara manual:'); if (barcode) { document.getElementById('input-barcode').value = barcode; } });
    tampilkanInventaris(); updateTampilanKeranjang();
});