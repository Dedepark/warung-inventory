// --- INISIALISASI SUPABASE ---
const SUPABASE_URL = 'https://ftfuhffjqppksecdrspl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZnVoZmZqcXBwa3NlY2Ryc3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMTcwNzcsImV4cCI6MjA3ODU5MzA3N30.unTDoXFJPaavRwxNmRkAZgNRTn_-qYaSBalaHGo6pGU';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- STATE GLOBAL ---
let keranjang = [];
let isScannerActive = false;
let codeReader = null;
let deferredPrompt = null;
let semuaBarang = []; // Cache untuk semua data barang

// --- FUNGSI UTILITAS ---
function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);
}

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

// --- FITUR PWA ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnInstall = document.getElementById('btn-install-pwa');
    btnInstall.style.display = 'block';
    btnInstall.textContent = 'Install';
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        showNotification('Aplikasi berhasil diinstall!', 'success');
    } else {
        showNotification('Install dibatalkan.', 'error');
    }
    deferredPrompt = null;
    document.getElementById('btn-install-pwa').style.display = 'none';
}

function checkInstallStatus() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const btnInstall = document.getElementById('btn-install-pwa');
    if (isStandalone) {
        btnInstall.innerHTML = '<i class="fas fa-trash"></i> Uninstall';
        btnInstall.onclick = () => {
            showNotification('Untuk menghapus aplikasi, cari opsi "Hapus aplikasi" atau "Uninstall" di pengaturan browser/Perangkat Anda.', 'info');
        };
    } else {
        btnInstall.innerHTML = '<i class="fas fa-download"></i> Install';
        btnInstall.onclick = installPWA;
        if (!deferredPrompt) {
            btnInstall.style.display = 'none';
        }
    }
}

// --- MANAJEMEN VIEW ---
function tampilkanView(viewName) {
    if (isScannerActive) {
        toggleGlobalScanner();
    }
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
function tutupModal() { modal.style.display = "none"; }

window.tampilkanDetailBarang = async function(id) {
    const { data: barang, error } = await supabase.from('inventaris').select('*').eq('id', id).single();
    if (error) { showNotification('Gagal mengambil data barang.', 'error'); console.error(error); return; }
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
    if (error) { showNotification('Gagal memperbarui barang.', 'error'); console.error(error); } else {
        showNotification('Barang berhasil diperbarui!', 'success');
        tutupModal(); await loadSemuaBarang(); tampilkanInventaris();
    }
}

async function hapusBarangDariModal() {
    const id = document.getElementById('edit-id').value;
    if (!confirm('Yakin ingin menghapus barang ini secara permanen?')) return;
    const { error } = await supabase.from('inventaris').delete().eq('id', id);
    if (error) { showNotification('Gagal menghapus barang.', 'error'); console.error(error); } else {
        showNotification('Barang berhasil dihapus!', 'success');
        tutupModal(); await loadSemuaBarang(); tampilkanInventaris();
    }
}

// --- FITUR INVENTARIS ---
async function loadSemuaBarang() {
    const { data, error } = await supabase.from('inventaris').select('*');
    if (error) { console.error(error); return; }
    semuaBarang = data;
}

async function tampilkanInventaris() {
    const container = document.getElementById('barang-list-container');
    container.innerHTML = '<p>Memuat data...</p>';
    if (semuaBarang.length === 0) { container.innerHTML = '<p>Belum ada barang.</p>'; return; }
    container.innerHTML = '';
    semuaBarang.forEach(barang => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'barang-item';
        itemDiv.dataset.nama = barang.nama_barang.toLowerCase();
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
        await loadSemuaBarang(); tampilkanInventaris();
    }
}

// --- PENCARIAN ---
function setupPencarian() {
    const searchInput = document.getElementById('search-barang');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const items = document.querySelectorAll('#barang-list-container .barang-item');
        items.forEach(item => {
            const namaBarang = item.dataset.nama;
            item.style.display = namaBarang.includes(searchTerm) ? 'flex' : 'none';
        });
    });
}

// --- TRANSAKSI MANUAL ---
function setupManualTransaksi() {
    const searchInput = document.getElementById('search-manual');
    const resultsContainer = document.getElementById('manual-search-results');

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (searchTerm.length < 2) {
            resultsContainer.classList.remove('show');
            resultsContainer.innerHTML = '';
            return;
        }

        const filteredBarang = semuaBarang.filter(barang =>
            barang.nama_barang.toLowerCase().includes(searchTerm) ||
            barang.barcode.includes(searchTerm)
        );

        resultsContainer.innerHTML = '';
        if (filteredBarang.length > 0) {
            resultsContainer.classList.add('show');
            filteredBarang.forEach(barang => {
                const item = document.createElement('div');
                item.className = 'manual-result-item';
                item.textContent = `${barang.nama_barang} (Stok: ${barang.stok})`;
                item.onclick = () => {
                    tambahKeKeranjang(barang);
                    searchInput.value = '';
                    resultsContainer.classList.remove('show');
                    resultsContainer.innerHTML = '';
                };
                resultsContainer.appendChild(item);
            });
        } else {
            resultsContainer.classList.remove('show');
        }
    });
}

// --- KERANJANG ---
function tambahKeKeranjang(barang) {
    if (barang.stok <= 0) { showNotification(`Stok ${barang.nama_barang} habis!`, 'error'); return; }
    const item = keranjang.find(i => i.id === barang.id);
    if (item) { item.jumlah++; } else { keranjang.push({ ...barang, jumlah: 1 }); }
    showNotification(`${barang.nama_barang} ditambahkan ke keranjang`, 'success');
    updateTampilanKeranjang();
}

async function updateJumlahDiKeranjang(barcode, perubahan) {
    const item = keranjang.find(i => i.barcode === barcode);
    if (!item) return;

    const jumlahBaru = item.jumlah + perubahan;
    if (jumlahBaru <= 0) {
        keranjang = keranjang.filter(i => i.barcode !== barcode);
    } else {
        // Cek stok terkini di database
        const { data: barangDb, error } = await supabase.from('inventaris').select('stok').eq('barcode', barcode).single();
        if (error || !barangDb) { showNotification('Gagal memverifikasi stok.', 'error'); return; }
        if (jumlahBaru > barangDb.stok) { showNotification('Stok tidak mencukupi!', 'error'); return; }
        item.jumlah = jumlahBaru;
    }
    updateTampilanKeranjang();
}

function updateTampilanKeranjang() {
    const list = document.getElementById('cart-list'); const totalEl = document.getElementById('cart-total');
    if (keranjang.length === 0) { list.innerHTML = '<li>Kosong.</li>'; totalEl.textContent = '0.00'; return; }
    list.innerHTML = ''; let total = 0;
    keranjang.forEach(item => {
        const sub = item.harga_jual * item.jumlah; total += sub;
        list.innerHTML += `
            <li>
                <div class="cart-item-details">
                    <span>${item.nama_barang}</span>
                </div>
                <div class="cart-item-quantity">
                    <button onclick="updateJumlahDiKeranjang('${item.barcode}', -1)">-</button>
                    <span>${item.jumlah}</span>
                    <button onclick="updateJumlahDiKeranjang('${item.barcode}', 1)">+</button>
                </div>
                <span>${formatRupiah(sub)}</span>
            </li>
        `;
    });
    totalEl.textContent = total.toFixed(2).replace('.', ',');
}

// --- SCANNER ---
async function prosesBarangTerscan(bc) {
    const barang = semuaBarang.find(b => b.barcode === bc);
    if (!barang) { showNotification(`Barcode ${bc} tidak ditemukan!`, 'error'); return; }
    tambahKeKeranjang(barang);
}

// Scanner Global (Overlay Melayang)
async function toggleGlobalScanner() {
    const btn = document.getElementById('btn-scan-float');
    const isInventarisView = document.getElementById('inventaris-view').classList.contains('active');

    if (isScannerActive) {
        if (codeReader) { await codeReader.reset(); }
        isScannerActive = false;
        btn.innerHTML = '<i class="fas fa-barcode"></i>';
        btn.classList.remove('scanning');
        const overlay = document.getElementById('floating-scanner-overlay');
        if (overlay) { document.body.removeChild(overlay); }

    } else {
        const overlay = document.createElement('div');
        overlay.id = 'floating-scanner-overlay';
        overlay.innerHTML = `<video id="video-zxing-global"></video>`;
        document.body.appendChild(overlay);
        const videoElement = document.getElementById('video-zxing-global');
        codeReader = new ZXing.BrowserMultiFormatReader();
        
        codeReader.decodeFromVideoDevice(undefined, videoElement, (result, err) => {
            if (result) {
                if (isInventarisView) {
                    document.getElementById('input-barcode').value = result.text;
                    showNotification('Barcode berhasil discan!', 'success');
                } else {
                    prosesBarangTerscan(result.text);
                }
                toggleGlobalScanner();
            }
            if (err && !(err instanceof ZXing.NotFoundException)) { console.error(err); }
        });
        
        isScannerActive = true;
        btn.innerHTML = '<i class="fas fa-stop"></i>';
        btn.classList.add('scanning');
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
    keranjang = []; updateTampilanKeranjang(); await loadSemuaBarang(); tampilkanInventaris();
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadSemuaBarang();
    tampilkanInventaris(); updateTampilanKeranjang(); setupPencarian(); setupManualTransaksi(); checkInstallStatus();
    
    document.querySelector('.menu-btn').addEventListener('click', () => {
        document.querySelector('.menu-dropdown').style.display = 
            document.querySelector('.menu-dropdown').style.display === 'block' ? 'none' : 'block';
    });

    document.getElementById('nav-inventaris').addEventListener('click', () => tampilkanView('inventaris'));
    document.getElementById('nav-kasir').addEventListener('click', () => tampilkanView('kasir'));
    document.getElementById('form-tambah-barang').addEventListener('submit', tambahBarang);
    document.getElementById('form-edit-barang').addEventListener('submit', editBarang);
    document.getElementById('btn-hapus-juga').addEventListener('click', hapusBarangDariModal);
    document.getElementById('btn-bayar').addEventListener('click', bayar);
    document.getElementById('btn-scan-float').addEventListener('click', toggleGlobalScanner);
});