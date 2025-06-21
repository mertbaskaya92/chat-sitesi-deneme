# 🎥 Video Chat App

Omegle tarzında görüntülü chat uygulaması. Socket.IO, React ve Node.js kullanılarak geliştirilmiştir.

## ✨ Özellikler

- 🎥 Gerçek zamanlı video görüşmesi
- 🔍 Rastgele eşleştirme sistemi
- 💬 Metin mesajlaşması
- 📱 Responsive tasarım
- 🎨 Modern ve güzel arayüz
- 🔄 Otomatik bağlantı yönetimi

## 🛠️ Teknolojiler

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **CORS** - Cross-origin resource sharing

### Frontend
- **React** - UI framework
- **Socket.IO Client** - Real-time client
- **WebRTC** - Peer-to-peer video streaming
- **CSS3** - Modern styling

## 🚀 Kurulum

### Gereksinimler
- Node.js (v14 veya üzeri)
- npm veya yarn

### Adımlar

1. **Projeyi klonlayın**
```bash
git clone <repository-url>
cd video-chat-app
```

2. **Bağımlılıkları yükleyin**
```bash
npm run install-all
```

3. **Uygulamayı başlatın**
```bash
npm run dev
```

Bu komut hem server'ı (port 5000) hem de client'ı (port 3000) başlatacaktır.

## 📁 Proje Yapısı

```
video-chat-app/
├── server/                 # Backend
│   ├── index.js           # Socket.IO server
│   └── package.json       # Server dependencies
├── client/                # Frontend
│   ├── public/            # Static files
│   ├── src/               # React components
│   │   ├── App.js         # Main component
│   │   ├── App.css        # Styles
│   │   └── index.js       # Entry point
│   └── package.json       # Client dependencies
├── package.json           # Root package.json
└── README.md             # This file
```

## 🎯 Kullanım

1. **Tarayıcıda açın**: `http://localhost:3000`
2. **Kamera izni verin**: Uygulama kamera ve mikrofon erişimi isteyecek
3. **Eşleştirme ara**: "Eşleştirme Ara" butonuna tıklayın
4. **Sohbet edin**: Eşleştirme bulunduğunda video görüşmesi başlar
5. **Mesaj gönderin**: Sağ panelden metin mesajları gönderebilirsiniz

## 🔧 Geliştirme

### Server'ı ayrı çalıştırma
```bash
cd server
npm run dev
```

### Client'ı ayrı çalıştırma
```bash
cd client
npm start
```

### Production build
```bash
npm run build
```

## 🌐 WebRTC Konfigürasyonu

Uygulama Google'ın ücretsiz STUN sunucularını kullanır:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

Production ortamında kendi TURN sunucularınızı ekleyebilirsiniz.

## 🔒 Güvenlik

- CORS yapılandırılmıştır
- WebRTC bağlantıları peer-to-peer'dir
- Sunucu sadece sinyal iletimi yapar

## 🐛 Bilinen Sorunlar

- Firefox'ta bazı WebRTC uyumluluk sorunları olabilir
- Mobil tarayıcılarda performans düşük olabilir
- NAT arkasındaki kullanıcılar için TURN sunucusu gerekebilir

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 🙏 Teşekkürler

- Socket.IO ekibine
- React ekibine
- WebRTC standartlarına
- Tüm açık kaynak topluluğuna

---

**Not**: Bu uygulama eğitim amaçlıdır. Production kullanımı için ek güvenlik önlemleri alınmalıdır. 