"""Mengubah Tracker_Evaluasi_RQ3_VideoToText.xlsx menjadi rq3_clips.json (data riil RQ3, 35 klip).

Pemakaian:  python build_rq3_clips.py <path-xlsx>
Tidak ada angka yang dihitung ulang atau diisi: semua nilai disalin apa adanya dari xlsx.
Kolom skor_meteor tidak dipakai (kosong di tracker).
"""
import json, sys, os
import openpyxl

src = sys.argv[1]
wb = openpyxl.load_workbook(src, data_only=True)

def rows(name):
    it = wb[name].iter_rows(values_only=True)
    head = next(it)
    return [dict(zip(head, r)) for r in it]

def num(v):
    return None if v in (None, '') else float(v)

def csv(v):
    return [x.strip() for x in (v or '').split(',') if x.strip()]

judge = {r['klip_id']: r for r in rows('Detail_LLM_Judge_RQ3')}
log = {r['klip_id']: r for r in rows('Log_Generate_RQ3')}
out = []
for r in rows('Tracker_Klip'):
    j = judge[r['klip_id']]
    out.append({
        'clipId': r['klip_id'],
        'fileName': r['nama_berkas_video'],
        'categories': csv(r['kategori']),
        'hasFinding': r['ada_temuan'] == 'Ya',
        'durationSeconds': num(r['durasi_klip_detik']),
        'referenceCaption': r['caption_acuan'],
        'validationStatus': r['status_validasi_pembimbing'],
        'modelCaption': r['caption_hasil_model'],
        'bleu': num(r['skor_bleu']),
        'llmOverall': num(j['skor_keseluruhan']),
        'completeness': num(j['skor_kelengkapan_deteksi']),
        'locationAccuracy': num(j['skor_akurasi_lokasi']),
        'severityAccuracy': num(j['skor_akurasi_keparahan']),
        'categoriesDetected': csv(j['kategori_terdeteksi']),
        'categoriesMissed': csv(j['kategori_tidak_terdeteksi']),
        'categoriesHallucinated': csv(j['kategori_halusinasi']),
        'judgeReason': j['alasan_singkat'],
        'generatorModel': log[r['klip_id']]['model_name'],
        'generatorFrames': int(log[r['klip_id']]['jumlah_frame']),
    })
dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rq3_clips.json')
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'klip ->', dst)
