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

// Sistem Notifikasi
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification notif-${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => notif.classList.add('show'), 10);
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => container.removeChild(notif), 300);
    }, 3000);
}

// --- MANAJEMEN VIEW ---
function tampilkanView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    document.getElementById(`${viewName}-view`).classList.add('active');
    document.getElementById(`nav-${viewName}`).classList.add('active');
}

// --- MODAL DETAIL BARANG ---
const modal = document.getElementById('modal-detail-barang');
const span = document.getElementsByClassName("close-btn")[0];

span.onclick = function() { tutupModal(); }
window.onclick = function(event) { if (event.target == modal) { tutupModal(); } }

function tutupModal() {
    modal.style.display = "none";
}

// Buat fungsi ini global agar bisa dipanggil dari onclick di HTML
window.tampilkanDetailBarang = async function(id) {
    const { data: barang, error } = await supabase.from('inventaris').select('*').eq('id', id).single();
    if (error) {
        showNotification('Gagal mengambil data barang.', 'error');
        console.error(error);
        return;
    }
    document.getElementById('edit-id').value = barang.id;
    document.getElementById('edit-nama').value = barang.nama_barang;
    document.getElementById('edit-barcode').value = barang.barcode;
    document.getElementById('edit-harga').value = barang.harga_jual;
    document.getElementById('edit-stok').value = barang.stok;
    modal.style.display = "block";
}

async function editBarang(event) {
    event.preventDefault();
    const id = document.getElementById('edit-id').value;
    const updatedData = {
        nama_barang: document.getElementById('edit-nama').value,
        barcode: document.getElementById('edit-barcode').value,
        harga_jual: parseFloat(document.getElementById('edit-harga').value),
        stok: parseInt(document.getElementById('edit-stok').value)
    };
    const { error } = await supabase.from('inventaris').update(updatedData).eq('id', id);
    if (error) {
        showNotification('Gagal memperbarui barang.', 'error');
        console.error(error);
    } else {
        showNotification('Barang berhasil diperbarui!', 'success');
        tutupModal();
        tampilkanInventaris();
    }
}

async function hapusBarangDariModal() {
    const id = document.getElementById('edit-id').value;
    if (!confirm('Yakin ingin menghapus barang ini secara permanen?')) return;
    const { error } = await supabase.from('inventaris').delete().eq('id', id);
    if (error) {
        showNotification('Gagal menghapus barang.', 'error');
        console.error(error);
    } else {
        showNotification('Barang berhasil dihapus!', 'success');
        tutupModal();
        tampilkanInventaris();
    }
}

// --- FITUR INVENTARIS ---
async function tampilkanInventaris() {
    const container = document.getElementById('barang-list-container');
    container.innerHTML = '<p>Memuat data...</p>';
    const { data, error } = await supabase.from('inventaris').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); showNotification('Gagal memuat data.', 'error'); return; }
    container.innerHTML = '';
    if (data.length === 0) { container.innerHTML = '<p>Belum ada barang.</p>'; return; }
    data.forEach(barang => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'barang-item';
        // Perbaikan: Menggunakan window.tampilkanDetailBarang agar bisa dipanggil dari onclick
        itemDiv.innerHTML = `
            <span class="nama-barang">${barang.nama_barang}</span>
            <button class="btn-detail" onclick="window.tampilkanDetailBarang(${barang.id})"><i class="fas fa-search"></i></button>
        `;
        container.appendChild(itemDiv);
    });
}

async function tambahBarang(e) {
    e.preventDefault();
    const form = e.target;
    const { error } = await supabase.from('inventaris').insert([{ 
        nama_barang: form['input-nama'].value, 
        barcode: form['input-barcode'].value, 
        harga_jual: parseFloat(form['input-harga'].value), 
        stok: parseInt(form['input-stok'].value) 
    }]);
    if (error) { showNotification(error.message, 'error'); } else { 
        showNotification('Barang berhasil ditambahkan!', 'success'); 
        form.reset(); 
        tampilkanInventaris(); 
    }
}

// --- FITUR KASIR & SCANNER (ZXING) ---
async function prosesBarangTerscan(bc) {
    console.log('Mencari barcode:', bc);
    const { data: barang, error } = await supabase.from('inventaris').select('*').eq('barcode', bc).single();
    if (error || !barang) { 
        showNotification(`Barcode ${bc} tidak ditemukan!`, 'error'); 
        return; 
    }
    if (barang.stok <= 0) { 
        showNotification(`Stok ${barang.nama_barang} habis!`, 'error'); 
        return; 
    }
    const item = keranjang.find(i => i.id === barang.id);
    if (item) { item.jumlah++; } else { keranjang.push({ ...barang, jumlah: 1 }); }
    showNotification(`${barang.nama_barang} ditambahkan ke keranjang`, 'success');
    updateTampilanKeranjang();
}

function updateTampilanKeranjang() {
    const list = document.getElementById('cart-list'); const totalEl = document.getElementById('cart-total');
    if (keranjang.length === 0) { list.innerHTML = '<li>Kosong.</li>'; totalEl.textContent = '0.00'; return; }
    list.innerHTML = ''; let total = 0;
    keranjang.forEach(item => { const sub = item.harga_jual * item.jumlah; total += sub; list.innerHTML += `<li><span>${item.nama_barang} (x${item.jumlah})</span><span>${formatRupiah(sub)}</span></li>`; });
    totalEl.textContent = total.toFixed(2).replace('.', ',');
}

// Scanner Global (melayang)
async function toggleGlobalScanner() {
    const btn = document.getElementById('btn-scan-float');
    const isInventarisView = document.getElementById('inventaris-view').classList.contains('active');

    if (isScannerActive) {
        if (codeReader) { await codeReader.reset(); }
        isScannerActive = false;
        btn.innerHTML = '<i class="fas fa-barcode"></i>';
    } else {
        codeReader = new ZXing.BrowserMultiFormatReader();
        let targetVideoId = isInventarisView ? 'video-zxing-tambah' : 'video-zxing';
        
        // Buat container video sementara
        const videoContainer = document.createElement('div');
        videoContainer.id = 'temp-video-container';
        videoContainer.innerHTML = `<video id="${targetVideoId}" style="width:100%; height:100%; object-fit:cover;"></video>`;
        document.body.appendChild(videoContainer);
        videoContainer.style.position='fixed'; videoContainer.style.top='0'; videoContainer.style.left='0'; videoContainer.style.width='100vw'; videoContainer.style.height='100vh'; videoContainer.style.zIndex='999';
        
        const videoElement = document.getElementById(targetVideoId);

        codeReader.decodeFromVideoDevice(undefined, videoElement, (result, err) => {
            if (result) {
                if (isInventarisView) {
                    document.getElementById('input-barcode').value = result.text;
                    showNotification('Barcode berhasil discan!', 'success');
                } else {
                    prosesBarangTerscan(result.text);
                }
                toggleGlobalScanner(); // Hentikan scanner
            }
            if (err && !(err instanceof ZXing.NotFoundException)) { console.error(err); }
        });
        isScannerActive = true;
        btn.innerHTML = '<i class="fas fa-stop"></i>';
    }
}

async function bayar() {
    if (keranjang.length === 0) { showNotification('Keranjang kosong!', 'error'); return; }
    const total = keranjang.reduce((t, i) => t + (i.harga_jual * i.jumlah), 0);
    const items = keranjang.map(i => ({ id: i.id, nama_barang: i.nama_barang, jumlah: i.jumlah, harga_satuan: i.harga_jual }));
    const { error: tErr } = await supabase.from('transaksi').insert([{ items, total_harga: total }]);
    if (tErr) { showNotification('Gagal menyimpan transaksi.', 'error'); return; }
    for (const i of keranjang) {
        const { data: b } = await supabase.from('inventaris').select('stok').eq('id', i.id).single();
        await supabase.from('inventaris').update({ stok: b.stok - i.jumlah }).eq('id', i.id);
    }
    showNotification(`Pembayaran berhasil! Total: ${formatRupiah(total)}`, 'success');
    keranjang = []; updateTampilanKeranjang(); tampilkanInventaris();
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-inventaris').addEventListener('click', () => tampilkanView('inventaris'));
    document.getElementById('nav-kasir').addEventListener('click', () => tampilkanView('kasir'));
    document.getElementById('form-tambah-barang').addEventListener('submit', tambahBarang);
    document.getElementById('form-edit-barang').addEventListener('submit', editBarang);
    document.getElementById('btn-hapus-juga').addEventListener('click', hapusBarangDariModal);
    document.getElementById('btn-bayar').addEventListener('click', bayar);
    document.getElementById('btn-scan-float').addEventListener('click', toggleGlobalScanner);
    
    tampilkanInventaris(); updateTampilanKeranjang();
});