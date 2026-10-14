# ZORTLORANT — tarayıcıda taktiksel FPS (yalnızca botlara karşı)

Valorant'tan esinlenen, Three.js ile yazılmış, botlara karşı + LAN çok oyunculu taktiksel FPS.
Koyu lacivert `#0f1923` + canlı kırmızı `#ff4655` arayüz, 7 farklı harita (Haven / Bind / Split / Ascent / Breeze / Lotus / Icebox), 11 silah (gerçek low-poly 3B modeller), 9 ajan.
Silahlar el kemiklerine bağlanır; walk/run animasyon blend'i vardır.

## Çalıştırma
**`index.html`'e çift tıklama — çalışmaz, sunucu şart.**
1. Node.js 18+ kur (https://nodejs.org).
2. **Windows:** `start.bat` · **Mac/Linux:** `./start.sh` · elle: `node server.js`
3. Tarayıcı `http://localhost:3000` adresini açar (port değiştirmek için `PORT=4000 node server.js`).

## Nasıl oynanır
Ana ekranda **ajanını** ve **başlangıç silahını** açılır menüden seç, **mod** (1v1–5v5), **bot zorluğunu** ve **haritayı** (veya Rastgele) belirle, **BAŞLAT**'a bas.
**OYNA** sekmesi: lobi yok, maç hemen başlar, iki takım da botlarla dolar (sen Saldırı takımındasın).

### LAN — arkadaşlarla
**ARKADAŞLARLA** sekmesinden mod seçip **ODA KUR**'a bas; lobide ekranda oda kodu ve adres (ör. `192.168.1.20:3000`) görünür. Arkadaşların aynı ağdan bu adresi açıp kodu yazar ya da açık odalar listesinden katılır. Lobide takım seçilir, ev sahibi **haritayı** seçer (herkes görür), **+ Bot ekle** ile boş slotları botla doldurup zorluğu ayarlar ve maçı başlatır. Sunucu adresini bulmak için `node server.js` çıktısındaki "LAN" satırına bak (Windows güvenlik duvarı sorarsa izin ver).
Raunt başında satın alma fazı var; tüm rakip botları elersen raundu alırsın. İlk 7 raundu alan **MAÇI KAZANDIN** der ve ana menüye dönersin.

| Tuş | İş |
|---|---|
| W A S D | hareket |
| Boşluk / Shift | zıpla / yavaş yürü |
| Sol tık | ateş · karambitle hızlı kesik |
| Sağ tık | nişan al: silah ortaya gelir, görüş biraz yakınlaşır, silahın kendi nişangahıyla nişan alırsın · Operator/Marshal'da dürbün · karambitle ağır darbe |
| F | elindeki silahı incele (bütün silahlar; karambitte çevirme animasyonu) |
| 1 / 2 / 3 · tekerlek | silah slotu: 1 ana silah · 2 tabanca · 3 karambit |
| R | şarjör değiştir |
| E / Q | ajan yetenekleri |
| B | satın alma · 1–9 hızlı al |
| Tab | skor tablosu |
| Esc | fareyi bırak (ekrandaki düğmeyle ana menüye dön) |
| C | eğil (daha küçük hedef, daha az dağılma, sessiz yürüme) |
| G | elindeki silahı at · yerdeki silahla değiştir (boş slota üstünden geçince otomatik alınır) |

Tuşların hepsi **Ayarlar → Tuş atama** bölümünden değiştirilebilir (oyun içinde Esc → AYARLAR).
Not: Chrome'da Ctrl+W sekmeyi kapatır. Bu yüzden eğilme varsayılan olarak **C** tuşunda. Oyun tıklayınca tam ekrana geçer; tam ekranda Ctrl+W sekmeyi kapatmaz (Ayarlar → "Tam ekran oyna" ile kapatılabilir). Maç sırasında sekme kapanacak olursa önce onay sorulur.

### Yenilikler (v6)
- **Geri tepme deseni:** seri atışta her silah kendine özgü bir desenle (önce yukarı, sonra sağa-sola) kayar; fareyi aşağı çekerek kontrol edilir.
- **Eğilme:** C ile eğilirsin; sunucuda vuruş kutusu ve kafa yüksekliği küçülür.
- **Silah atma/alma:** ölen oyuncunun ana silahı yere düşer; G ile at/değiştir.
- **Yeni ajanlar:** *Kale* (Bariyer duvarı + Keşif taraması) ve *Alev* (Atılış + Molotof).
- **Kaplamalar:** Cephanelik'te her silah için Altın, Kızıl Ejder, Buz, Gece Neon, Kamuflaj.
- **Darbe izleri ve kan:** duvarda kurşun deliği ve toz, vurulana kan efekti ve sarsılma.
- **Ölüm kamerası:** seni öldürene döner, adını, silahını ve kalan canını gösterir.
- **Mini harita:** takım arkadaşları ve takımının gördüğü düşmanlar, sis, ateş, yerdeki silahlar.
- **Ayarlar:** nişangah rengi/uzunluk/kalınlık/boşluk/orta nokta, FOV, ses, mini harita, silah sallanması, tuş atama.
- **Maç sonu ekranı:** maçın oyuncusu (MVP), K/D, hasar, isabet ve kafa vuruşu yüzdesi.

Sol alttaki HUD: **CAN**, **silah + mermi**, **KALAN BOT**. Ortada nişangah, sağ altta kredi.

## Silah slotları (Valorant gibi)
- **1 — ana silah:** satın aldığın SMG / pompalı / tüfek / keskin nişancı.
- **2 — tabanca:** başta Classic; Ghost veya Sheriff alırsan bu slota düşer.
- **3 — Karambit:** her zaman elinde. Sol tık 40 hasar (kafa ×1.5), sağ tık 80 hasar. Elindeyken %12 daha hızlı koşarsın. Çekerken parmak halkasında döner, **F** ile incelenir.
Raundu sağ çıkarsan iki silahın da sende kalır. Ölürsen ana silahını kaybedersin, tabancan Classic'e döner.

## Silahlar (gerçek low-poly 3B modeller, birinci şahıs elleriyle)
Classic, Ghost, Sheriff (tabanca) · Bucky, Judge (pompalı) · Spectre (SMG) · Phantom, Vandal (tüfek) · Ares (makineli) · Marshal, Operator (keskin).
Ana menü → **CEPHANELİK**'te 3B döndürüp istatistiklerine bakabilirsin. Modeller `public/models/weapons/*.glb` içinde; değiştirmek istersen aynı adla kendi `.glb`'ni koy (`OKU-BENI.txt`). Bir dosyayı silersen o silah eski kodla üretilen modele döner.

## Haritalar
Menüde (botlara karşı) veya lobide (LAN, ev sahibi) seçilir; **Rastgele** seçilirse her maç başında yeniden çekilir: **Haven C-Site** (Japon köyü), **Bind Çöl Pazarı** (çöl, kapalı koridor), **Split Neon Sokak** (gece şehri, dar ara sokaklar), **Ascent Meydan** (İtalyan meydanı, çeşme), **Breeze Ada** (tropik, açık alan), **Lotus Tapınağı** (orman, sütunlu avlu), **Icebox Liman** (karlı liman, konteynerler). Her birinin kendi yerleşimi, zemini, renkleri, gökyüzü ve ağaçları var. Haritada gördüğün her nesnenin çarpışması vardır; çarpışmasız süs eşyaları kaldırıldı. Sunucuda harita tek ve ortaktır: aynı anda birden fazla oda açılırsa haritalar karışabilir, tek oda ile oyna.
Sketchfab/CGTrader'dan indirdiğin low-poly bir harita için `public/models/maps/OKU-BENI.txt`: dosyayı `map.glb` adıyla koy, sunucuyu yeniden başlat (özel harita varken rastgele seçim yapılmaz).

### Ücretsiz model / harita kaynakları (CC0 veya ücretsiz)
- **Kenney.nl** — CC0 karakter, silah, ortam kitleri
- **Quaternius.com** — CC0 animasyonlu karakter paketleri
- **KayKit / Cinevva** — ücretsiz GLB karakterler
- **Sketchfab** → Downloadable + free / CC0, format glTF/GLB
Silah: `public/models/weapons/classic.glb` vb. · Harita: `public/models/maps/map.glb`

**Not:** Multiplayer ve botlar için Node.js sunucusu şarttır (WebSocket + oyun mantığı). Sadece `index.html` açmak tarayıcı güvenliği yüzünden çalışmaz.

## Dosyalar
`server.js` (statik sunucu + WebSocket, maç/raunt, bot yapay zekâsı, hasar hesabı) · `mapload.js` (özel GLB harita → çarpışma) ·
`public/shared.js` (silah/ajan/harita verisi) · `public/main.js` (istemci: menü, sahne, HUD) · `public/weapons.js` (silah modelleri) · `public/index.html` · `public/style.css`.

## Modeller ve lisanslar
- Soldier.glb, Xbot.glb — Mixamo kaynaklı (three.js örnekleri) · RobotExpressive.glb — Tomás Laulhé, CC0.
- **Yeni ajanlar** (Tetik, Nova, Er) — Quaternius, **CC0** (poly.pizza): `Swat.glb` (SWAT), `Operative.glb` (Animated Woman), `ShooterSoldier.glb` (Character Soldier; içindeki hazır silahlar gizlenir, oyunun seçtiği silah eline verilir).
- **Silahlar** — hepsi **CC0** (poly.pizza): Classic, Ghost (Pistol), Sheriff (Revolver), Bucky (Shotgun), Spectre (Submachine Gun), Phantom / Vandal (Assault Rifle), Ares (Bullpup), Marshal / Operator (Sniper Rifle) — Quaternius · Judge (Shotgun Auto) — Pichuliru.
- CC0 = kamu malı; atıf zorunlu değil, ticari kullanım dahil serbest. Harita kodla üretilmiştir.
Valorant adları/haritaları Riot Games'e aittir; bu proje hayran yapımı bir demodur.

## LAN'da arkadaş "oda bulunamadı" diyorsa
Oda, sunucuyu çalıştıran bilgisayarda yaşar. Arkadaşın **kendi bilgisayarında `start.bat` çalıştırmamalı**; tarayıcıdan senin LAN adresini (`http://192.168.x.x:3000`, lobide ve sunucu konsolunda yazar) açmalı. `localhost` yalnızca kendi bilgisayarını gösterir. Bağlanamıyorsa Windows güvenlik duvarında Node.js'e "Özel ağ" izni ver; iki cihaz aynı Wi-Fi'da olmalı.

## Nişan alma (sağ tık)

- **Silah başına profil:** her silahın nişan süresi, yakınlaştırması, hareket yavaşlaması ve nişangâh türü farklıdır (`main.js` içinde `ADS_P`).
- **Gerçek hizalama:** silah modelinin kendi nişangâh yüksekliği ölçülür, nişanken tam o hizaya gelir (kendi GLB modellerinle de çalışır).
- **Nişangâhlar:** tabanca kırmızı nokta / halka, Spectre kırmızı nokta, Phantom & Ares holografik halka, Vandal şevron, pompalılar bilye. Ayrıca kenar kararması.
- **Keskin nişancı (Operator, Marshal):** gerçek dürbün, mil-dot retikül, 2 yakınlaştırma kademesi (**fare tekerleği**), el titremesi ve **nefes tutma** (yavaş yürü tuşu, ~3 sn).
- **Ayarlar → NİŞAN ALMA:** basılı tutmak yerine aç/kapat ve nişan hassasiyeti. Şarjör bitince sağ tık hâlâ basılıysa otomatik tekrar nişan alır.
- Judge'ın `judge.glb` dosyası motorda çizilmediği için kaldırıldı; kodla üretilen model kullanılır.
