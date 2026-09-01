# Kullanım Testi ve Hata Tespit Raporu

**Proje:** autonomous-income-agent
**Test edilen commit:** `680ec93` (`main`)
**Tarih:** 2026-09-01
**Ortam:** Node v22.22.2, npm 10.9.7, Linux
**Kapsam:** Projenin çalıştırılması, dokümante edilen çekirdek döngünün uçtan uca kullanım testi, düşmanca (adversarial) senaryolar, üretim açılış yolu ve kurtarma testleri.

---

## 1. Yönetici özeti

Depo **temiz bir şekilde derleniyor ve mevcut doğrulama kapısı tamamen yeşil**: `tsc --noEmit` hatasız, 65/65 birim testi geçiyor, `build` başarılı. Dokümante edilen çekirdek döngü (Discover → Evaluate → Policy → Plan → Execute → Approval Gate → Verify → Ledger → Learn) uçtan uca çalıştırıldığında **mutlu yol kusursuz işliyor**.

Ancak mutlu yolun dışına çıkıldığında tablo değişiyor. **14 bulgu** tespit edildi; bunlardan biri kritik.

Ana tema şu: **R6 (güvenlik/sahiplik yetkilendirmesi) ve R8 (üretim) modülleri yazılmış, test edilmiş, ancak hiçbir uygulama yoluna bağlanmamış.** `src/` içinde `OwnerAuthorizationVerifier`, `AgentKillSwitch`, `SpendBudgetGuard` ve `ProductionHttpsTransport` sınıflarına yapılan **sıfır** çağrı var — yalnızca kendi birim testleri onlara dokunuyor:

```
$ grep -rn "OwnerAuthorizationVerifier\|AgentKillSwitch\|SpendBudgetGuard" src/ | grep -v "src/security/"
(çıktı yok)
```

Sonuç olarak README'nin "%100 tamamlandı" tablosu ile çalışan sistemin fiilî güvenlik duruşu arasında bir fark var: kontroller **kütüphane olarak mevcut**, ancak **yaptırım yolunda devrede değil**.

### Bulgu dağılımı

| Önem | Adet | Bulgular |
|---|---:|---|
| Kritik | 1 | F-01 |
| Yüksek | 3 | F-02, F-03, F-04 |
| Orta | 4 | F-05, F-06, F-07, F-08 |
| Düşük | 6 | F-09 … F-14 |

---

## 2. Çalıştırma sonuçları (temel kapı)

| Adım | Komut | Sonuç |
|---|---|---|
| Bağımlılık kurulumu | `npm install` | ✅ 6 paket, 5 sn |
| Tip kontrolü | `npm run typecheck` | ✅ hatasız |
| Test paketi | `npm test` | ✅ **65/65 geçti**, 0 hata, ~2.7 sn |
| Derleme | `npm run build` | ✅ `dist/` üretildi |
| Tam kapı | `npm run check` | ✅ geçti |

**Not:** Mevcut CI kapısının yeşil olması bu raporda tespit edilen hataların hiçbirini yakalamıyor. Bunun nedeni Bölüm 5'te açıklanan test kapsamı boşluğudur.

---

## 3. Uçtan uca kullanım testi (mutlu yol)

Gerçek bir kullanıcının izleyeceği tam iş akışı çalıştırıldı — bir mikro-SaaS fırsatının keşfinden gelir dağıtımına kadar:

| Adım | Sonuç |
|---|---|
| Fırsat değerlendirme | ✅ skor `0.727`, kanıt kalitesi `0.800` → karar `pursue` |
| Kanıtın hafızaya alınması | ✅ 3 kayıt, etiketle geri çağırma çalışıyor |
| Ürün planı üretimi | ✅ `design → build → copy → offer` doğru topolojik sırada |
| 4 adımın runtime'da yürütülmesi | ✅ hepsi `succeeded`, politika `allow` |
| Onay kapısı (`legal.sign_contract`) | ✅ onaysız → `awaiting_approval`; onaylı → `succeeded` |
| Değerlendirici | ✅ ağırlıklı skor `0.900` → `accept` |
| Defter ve dağıtım | ✅ net `25400`, dağıtım `20320 + 3810 + 1270` = net (tam sayı, kayıpsız) |
| Denetim zinciri | ✅ 11 olay, `verifyAuditChain` doğruluyor |

**Ayrıca doğrulandı ve sağlam bulundu:**

- **Eşzamanlılık:** Aynı `actionId` ile paralel iki görev → yürütücü tam olarak **1 kez** çalıştı, ikincisi `rejected_duplicate`.
- **Yeniden deneme:** `TransientExecutionError` yapılandırılan sınır içinde doğru yeniden deneniyor.
- **Defter aritmetiği:** 12.000 vakalık fuzz testi (4 farklı dağıtım politikası × 3.000 net değeri) — **0 uyuşmazlık**, hiç negatif pay üretilmedi, kuruş kaybı yok.
- **Planlayıcı:** döngü, eksik bağımlılık, boş hedef, yinelenen `actionId`, `maxSteps` — hepsi doğru reddediliyor.
- **Kurtarma:** Çökme sonrası yeniden başlatma **yan etkileri tekrarlamıyor** (2 etki → yeniden başlatma sonrası hâlâ 2). Kontrol noktası dosyası `0600` izinle yazılıyor. Kurcalanmış kontrol noktası reddediliyor.
- **Üretim taşıma katmanı (R8):** DNS rebinding saldırısına karşı **dayanıklı** — izin listesindeki bir alan adı `169.254.169.254`'e çözümlendiğinde istek engelleniyor; karışık DNS yanıtı (public + private) da engelleniyor. Bu katman iyi yazılmış.

---

## 4. Bulgular

### 🔴 F-01 — KRİTİK: İmzasız, uydurma bir onay nesnesi para transferini yetkilendiriyor

**Dosya:** `src/approval/gate.ts:23-38`, `src/runtime/agent-runtime.ts:57-65`

`authorizeExecution()` bir onayı yalnızca **yapısal olarak** kontrol ediyor: `approvedBy === "owner"` mi, `capability`/`actionId` eşleşiyor mu, zaman penceresi geçerli mi. Kriptografik doğrulama **yok**. `OwnerApprovalGrant` arayüzünde imza, anahtar kimliği veya nonce alanı bile **bulunmuyor**.

R6'da yazılan `OwnerAuthorizationVerifier` (Ed25519, nonce tekrar koruması, güvenilir anahtar zinciri) doğru çalışıyor — ancak **hiçbir yerden çağrılmıyor.**

**Yeniden üretim:**

```ts
const runtime = new AgentRuntime(registry);   // finance.transfer_funds kayıtlı
const result = await runtime.run({
  taskId: "t-evil", actionId: "act-evil-1",
  capability: "finance.transfer_funds",
  input: { amountMinor: 5_000_000, to: "attacker-iban" },
  approval: {                                  // ← düz bir nesne literali, imza yok
    approvalId: "totally-legit",
    capability: "finance.transfer_funds",
    actionId: "act-evil-1",
    approvedBy: "owner",
    approvedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
});
```

**Gözlemlenen çıktı:**

```
status=succeeded  transferred=5000000
reason=Owner approval verified for finance.transfer_funds.
```

Görev nesnesini oluşturabilen herhangi bir kod yolu (bir planlayıcı çıktısı, bir eklenti, deserialize edilmiş kuyruk mesajı) `expiresAt` alanına uzak bir tarih yazarak **`finance.transfer_funds`, `finance.withdraw_funds`, `legal.sign_contract`, `identity.submit_kyc` dahil tüm sahip-onayı-gerektiren yetenekleri** kendi kendine yetkilendirebilir. Denetim kaydı bunu "Owner approval verified" olarak, meşru bir onay gibi kaydeder.

Bu, projenin 3 numaralı "pazarlıksız işletme kuralı"nın doğrudan ihlalidir.

**Öneri:** `OwnerApprovalGrant`'i `SignedOwnerApproval` ile değiştirin (veya `signatureBase64` + `keyId` + `nonce` alanlarını zorunlu kılın) ve `authorizeExecution` içinden `OwnerAuthorizationVerifier.verify()` çağırın. `AgentRuntime` yapıcısına güvenilir anahtarlarla yapılandırılmış bir doğrulayıcı enjekte edin.

---

### 🟠 F-02 — YÜKSEK: Kill-switch runtime'ı durdurmuyor

**Dosya:** `src/security/controls.ts:1-21`, `src/runtime/agent-runtime.ts`

`AgentKillSwitch` doğru çalışan bir sınıf, ancak `AgentRuntime` onu ne tanıyor ne de çağırıyor. `assertOperational()` uygulama yolunda hiç çalışmıyor.

**Yeniden üretim ve gözlem:**

```ts
const kill = new AgentKillSwitch();
kill.engage("owner halted all autonomous operation");   // kill.engaged === true
const r = await runtime.run({ taskId:"t", actionId:"a", capability:"content.draft", input:{} });
// → r.status === "succeeded"
```

Sahip acil durdurma düğmesine bastığında ajan **çalışmaya devam ediyor**. `docs/SECURITY.md`'de vaat edilen "incident shutdown controls" fiilen devrede değil.

**Öneri:** Kill-switch'i `AgentRuntime`'a enjekte edin ve `run()` başında, tekrar kontrolünden önce `assertOperational()` çağırın; engellenen görevler denetim kaydına `deny` olarak yazılmalı.

---

### 🟠 F-03 — YÜKSEK: Bütçe aşan harcamanın onay yolu yok (kilitlenme)

**Dosya:** `src/policy/engine.ts:51-53`

`finance.spend_within_budget` `AUTONOMOUSLY_ELIGIBLE` kümesinde olduğu için `OWNER_APPROVAL_REQUIRED` dalına hiç girmiyor. Alt dalda `withinBudget !== true` ise `require_owner_approval` dönüyor — ama bu noktada `context.ownerApproved` **hiç okunmuyor**.

**Sonuç:** Politika sahibin onayını istiyor, sahip onayı veriyor, politika yine onay istiyor. Sonsuz döngü.

**Gözlemlenen çıktı:**

```
evaluatePolicy({ capability:"finance.spend_within_budget",
                 withinBudget:false, ownerApproved:true })
  → decision = require_owner_approval      // ownerApproved yok sayıldı

authorizeExecution({ ... geçerli, süresi dolmamış sahip onayı ... })
  → decision = require_owner_approval      // runtime: awaiting_approval
```

Bütçe zarfını aşan hiçbir harcama, sahip ne yaparsa yapsın, **hiçbir zaman** yürütülemez. Bu bir güvenlik açığı değil, işlevsel bir çıkmaz — ama üretimde ajanı sessizce durdurur.

**Öneri:** Bütçe kontrolünden önce `context.ownerApproved === true` durumunu `allow` olarak ele alın:

```ts
if (capability === "finance.spend_within_budget" && context.withinBudget !== true) {
  if (context.ownerApproved === true) {
    return { decision: "allow", reason: "Owner approved an over-budget spend." };
  }
  return { decision: "require_owner_approval", reason: "..." };
}
```

---

### 🟠 F-04 — YÜKSEK: Sandbox girdi hash'i `Date`/`Map`/`Set` için çakışıyor

**Dosya:** `src/recovery/sandbox.ts:26-39`

`stable()` fonksiyonu `typeof value === "object"` dalında `Object.keys()` kullanıyor. `Date`, `Map` ve `Set` nesnelerinin numaralandırılabilir kendi anahtarı olmadığı için **hepsi `{}` olarak serileştiriliyor** ve aynı SHA-256 değerini üretiyor.

**Gözlemlenen çıktı:**

```
{x: new Date("2026-01-01")} = c4a1c2464e2423ac...
{x: {}}                     = c4a1c2464e2423ac...
{x: new Map([["secret","value"]])} = c4a1c2464e2423ac...
{x: new Set([1,2,3])}       = c4a1c2464e2423ac...
→ 4 farklı girdi, 1 tek hash
```

**Somut etkisi — idempotens koruması atlanıyor:**

```ts
sb.execute({ stepId:"settle", effect:"network",
             input:{ settleAt: new Date("2026-09-01") } }, charge);
sb.execute({ stepId:"settle", effect:"network",
             input:{ settleAt: new Date("2030-12-31") } }, charge);
// İkinci çağrı: inputHash aynı → "Idempotency conflict" ATILMIYOR,
// tamamlanmış adım önbelleğinden sessizce eski makbuz dönüyor.
```

`execute()` içindeki `Idempotency conflict for completed step` koruması bu girdi tipleri için **hiçbir zaman tetiklenmiyor**, ve kontrol noktasına yazılan "replay evidence" bu alanlar için anlamsız hale geliyor (R7'nin "Stable SHA-256 input/output hashing for replay evidence" iddiası bu tiplerde tutmuyor).

**Öneri:** `stable()` içine `Date` için açık bir dal ekleyin (`value.toISOString()`), `Map`/`Set` ve diğer tanınmayan nesne tiplerini ise sessizce `{}`'ye indirgemek yerine **açıkça reddedin** (`stable()` zaten bilinmeyen `typeof` için hata atıyor — aynı fail-closed davranışı prototipi `Object.prototype` olmayan nesnelere de uygulayın).

---

### 🟡 F-05 — ORTA: `validatePublicHttpsUrl` IPv6 özel adreslerini engellemiyor

**Dosya:** `src/integrations/safe-url.ts:1-41`

SSRF kontrolü yalnızca IPv4 özel aralıklarını ve `::1`'i tanıyor. Aşağıdakiler **geçiyor**:

| Hedef | Sonuç |
|---|---|
| `https://[fd00::1]/admin` | ❌ İZİN VERİLDİ (IPv6 unique-local) |
| `https://[fe80::1]/admin` | ❌ İZİN VERİLDİ (IPv6 link-local) |
| `https://[::ffff:127.0.0.1]/admin` | ❌ İZİN VERİLDİ (IPv4-eşlemeli loopback) |

Doğru engellenenler: `127.0.0.1`, `localhost`, `10.0.0.5`, `169.254.169.254`, `[::1]`, ondalık `2130706433`, hex `0x7f000001`, URL'de kimlik bilgisi, `http://`.

**Hafifletici unsur:** Üretimde `ProductionHttpsTransport` bu adresleri `isPublicNetworkAddress()` ile **doğru şekilde engelliyor** (test edildi ve doğrulandı). Yani üretim yapılandırmasında sömürülebilir değil. Ancak:

1. `validatePublicHttpsUrl` R5'in ilan edilmiş SSRF sınırı ve `IntegrationGateway` tarafından tek başına kullanılıyor — üretim taşıma katmanı dışında bir taşıma (örn. basit bir `fetch` sarmalayıcı) kullanan her entegrasyon korumasız.
2. İki katman **birbiriyle çelişiyor**: `isPublicNetworkAddress` `fd00::1`'i private sayıyor, `validatePublicHttpsUrl` saymıyor. Aynı deponun iki güvenlik katmanının aynı soruya farklı cevap vermesi bakım riski.

**Öneri:** `safe-url.ts`'i `network-transport.ts` içindeki `ipv6IsPublic`/`ipv4IsPublic` mantığını paylaşacak şekilde birleştirin; tek bir adres sınıflandırma kaynağı olsun.

---

### 🟡 F-06 — ORTA: `.env.example`'daki PEM formatı üretim yükleyicisi tarafından okunamıyor

**Dosya:** `.env.example:7`, `src/production/config.ts`, `src/production/readiness.ts:20-28`

`.env.example` sahip açık anahtarını gömülü `\n` kaçış dizileriyle gösteriyor:

```
AIA_OWNER_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----\nREPLACE_WITH_PUBLIC_KEY\n-----END PUBLIC KEY-----
```

`loadProductionConfig` bu kaçışları çözmüyor, `createPublicKey()` ham `\n` dizisini ayrıştıramıyor.

**Gerçek bir Ed25519 anahtarıyla test edildi:**

| Operatörün yazma biçimi | `owner_public_key` | Sonuç |
|---|---|---|
| `\n` kaçışlarıyla (`.env.example`'ın gösterdiği biçim) | ❌ başarısız | `not_ready` |
| Gerçek satır sonlarıyla | ✅ geçti | `ready` |

Örneği birebir izleyen bir operatör şu çıktıyı alıyor ve nedenini anlayamıyor:

```
Production readiness failed: owner_public_key.
health = {"status":"degraded","ready":false,"failedChecks":["owner_public_key"]}
```

Sistem **fail-closed davranıyor (doğru)**, ancak hata mesajı sorunun kaçış dizilerinde olduğunu söylemiyor ve depodaki tek örnek yapılandırma çalışmayan biçimi öğretiyor.

**Öneri:** Yükleyicide `AIA_OWNER_PUBLIC_KEY_PEM` için `replace(/\\n/g, "\n")` normalizasyonu yapın (veya base64/tek satır SPKI kabul edin) ve `docs/OPERATIONS.md`'de beklenen biçimi netleştirin.

---

### 🟡 F-07 — ORTA: R7/R8 modülleri paket giriş noktasından dışa aktarılmıyor

**Dosya:** `src/index.ts`

`src/index.ts` 23 modülü yeniden dışa aktarıyor, ancak `production/` ve `recovery/` dizinlerinin **tamamını atlıyor**. Giriş noktasından erişilemeyen 11 sembol:

```
loadProductionConfig, evaluateProductionReadiness, assertProductionReady,
createHealthSnapshot, ProductionHttpsTransport, SystemAddressResolver,
EnvironmentSecretValueResolver, isPublicNetworkAddress,
resolvePinnedPublicAddress, DeterministicSandbox, FileCheckpointStore
```

Tüketiciler bunlara ancak derinlemesine dosya yolu importlarıyla ulaşabiliyor (`.../src/production/config.js`). Testler zaten böyle yaptığı için CI bunu yakalamıyor. Pratikte R8'in tüm üretim yüzeyi paketin genel API'sinde **yok**.

**Öneri:** Eksik `export *` satırlarını `src/index.ts`'e ekleyin.

---

### 🟡 F-08 — ORTA: Reddedilen istekler hız limiti bütçesini tüketiyor

**Dosya:** `src/integrations/gateway.ts:85-98`

`execute()` içinde sıra şöyle: `#consumeRateBudget(now)` → kanal yetkilendirmesi → politika kontrolü. Yani **yetkisiz istekler de bütçeyi harcıyor.**

**Gözlemlenen çıktı** (limit: pencere başına 2 istek):

```
attacker call 0: blocked (Write integration target is not authorized...)
attacker call 1: blocked (Write integration target is not authorized...)
legitimate call after 2 blocked writes: DENIED :: Integration request rate limit exceeded.
```

Yetkisiz bir origin'e yapılan iki başarısız yazma denemesi, meşru araştırma trafiğinin tamamını pencere boyunca kilitliyor. Yanlış yapılandırılmış bir yeniden deneme döngüsü de aynı etkiyi yaratır.

**Öneri:** Hız bütçesini yetkilendirme ve politika kontrolünden **sonra**, taşıma çağrısından hemen önce tüketin.

---

### 🔵 F-09 — DÜŞÜK: Denetim zaman damgaları enjekte edilen saati yok sayıyor

**Dosya:** `src/runtime/agent-runtime.ts:29`

`#record()` her zaman `new Date().toISOString()` kullanıyor; `options.now` yalnızca politika değerlendirmesine geçiyor.

```
Enjekte edilen saat: 2020-01-01T00:00:00.000Z
Denetim kaydındaki zaman damgası: 2026-09-01T17:42:27.866Z
```

Karar bir zamana göre alınıyor, denetim kaydı başka bir zaman gösteriyor. Deterministik yeniden oynatma ve olay incelemesi için kayıt güvenilmez hale geliyor.

**Öneri:** `options.now` verildiğinde denetim zaman damgasında da onu kullanın.

---

### 🔵 F-10 — DÜŞÜK: `maxSteps: NaN` plan sınırını tamamen devre dışı bırakıyor

**Dosya:** `src/planner/plan.ts:90`

```ts
const maxSteps = Math.max(1, Math.floor(draft.maxSteps ?? 50));
// maxSteps = NaN  →  Math.floor(NaN) = NaN  →  Math.max(1, NaN) = NaN
// ardından: draft.steps.length > NaN  →  her zaman false
```

**Doğrulandı:** `maxSteps: NaN` ile **5.000 adımlık** bir plan hatasız kabul edildi. Sayısal olmayan bir yapılandırma değeri (örn. `Number(process.env.X)` sonucu) sınırı sessizce kaldırır.

**Öneri:** `Number.isSafeInteger` doğrulaması ekleyin, geçersizse varsayılana düşün veya hata atın.

---

### 🔵 F-11 — DÜŞÜK: `validateSecretReference` gömülü kimlik bilgisi değerlerini reddetmiyor

**Dosya:** `src/security/controls.ts:31-36`

Kontrol `/password|token|secret|key=/i` **ve** `includes("=")` koşullarının ikisini birden arıyor, bu yüzden gerçek kimlik bilgisi biçimleri "referans adı" olarak kabul ediliyor:

| Girdi | `validateSecretReference` | Sonraki katman |
|---|---|---|
| `sk-proj-9f3a2b1c8d7e` | kabul | ✅ resolver reddetti (büyük harf deseni) |
| `credential=hunter2` | kabul | ✅ resolver reddetti |
| `AKIAIOSFODNN7EXAMPLE` | kabul | ✅ "environment secret unavailable" |

**Etki sınırlı:** `EnvironmentSecretValueResolver`'daki `^[A-Z][A-Z0-9_]{2,127}$` deseni ve ortam değişkeni araması zinciri **fail-closed** kapatıyor — sızıntı oluşmuyor. Sorun, fonksiyonun kendi hata mesajında iddia ettiği güvenceyi ("must be an identifier, never an inline credential") sağlamaması ve hatanın yanıltıcı bir noktada ortaya çıkması.

**Öneri:** Ya kontrolü referans-adı desenine (`^[A-Z][A-Z0-9_]{2,127}$`) sıkılaştırın, ya da fonksiyonun sözleşmesini gerçekte yaptığı işe göre yeniden ifade edin.

---

### 🔵 F-12 — DÜŞÜK: Sandbox, isteğe bağlı `undefined` alan içeren girdileri reddediyor

**Dosya:** `src/recovery/sandbox.ts:34-38`

```ts
sandbox.execute({ stepId:"s", effect:"none", input:{ a: 1, uri: undefined } }, fn);
// → Error: Unsupported sandbox value type: undefined.
```

TypeScript'te son derece yaygın olan "isteğe bağlı alan atanmamış" şekli çalışmıyor. Depo genelinde `exactOptionalPropertyTypes` ile `...(x === undefined ? {} : { x })` kalıbı kullanıldığı için tutarsız. `Date` ve iç içe diziler sorunsuz geçiyor (ancak F-04'e bakınız).

**Öneri:** `stable()` içinde `undefined` değerli anahtarları JSON semantiğine uygun şekilde atlayın.

---

### 🔵 F-13 — DÜŞÜK: `MemoryStore` süresi çoktan dolmuş kayıtları kabul ediyor

**Dosya:** `src/memory/store.ts:35-46`

`validate()` yalnızca `expiresAt > observedAt` şartını arıyor; kaydın **şu ana göre** zaten süresi dolmuş olması engellenmiyor. Kayıt yazılıyor, `get()`/`query()` tarafından görülmüyor, ama `size()` tarafından sayılıyor — `pruneExpired()` çağrılana kadar sessizce yer kaplıyor.

**Öneri:** Yazma sırasında süresi dolmuş kayıtları reddedin veya hiç saklamayın.

---

### 🔵 F-14 — DÜŞÜK: Dokümantasyon ve test adları uygulamayı yanlış temsil ediyor

1. **`docs/SECURITY.md:48`** hâlâ gelecek zamanla yazılmış: *"R6 will add signed approval tokens, replay protection, ... incident shutdown controls"* — README ise R6'yı "Complete" olarak işaretliyor. F-01 ve F-02 ışığında **doküman fiilî duruma daha yakın**, README ise değil.

2. **`docs/SECURITY.md:18-25`** onay grantını imzasız alanlarla tanımlıyor (`approvalId`, capability, actionId, approver, iki zaman damgası) — bu tam olarak F-01'deki sömürülebilir yapıdır. Doküman R0 sözleşmesinde donmuş.

3. **`tests/security.test.ts:65`** — `"kill switch blocks execution until owner release"` adlı test hiçbir zaman `AgentRuntime` kullanmıyor; yalnızca `assertOperational()`'ın hata atıp atmadığını kontrol ediyor. Test adı, doğrulamadığı bir davranışı iddia ediyor (F-02).

4. **README** R6 için *"Ed25519-signed owner approval envelopes"* ve *"Owner kill-switch that blocks agent operation"* diyor. Her ikisi de sınıf olarak var, ancak hiçbir işlem yolunda devrede değil.

---

## 5. Kök neden: test kapsamı boşluğu

65 testin tamamı geçmesine rağmen bu bulguların hiçbiri yakalanmıyor, çünkü **modüller yalnızca izole halde test ediliyor, entegre halde değil**:

- `tests/security.test.ts` `signOwnerApproval` + `OwnerAuthorizationVerifier` çiftini kendi arasında test ediyor — `AgentRuntime` veya `authorizeExecution` ile birlikte **hiç** test edilmiyor.
- `tests/runtime.test.ts` onay yolunu test ediyor ama yalnızca *iyi niyetli* grantlarla — "uydurma grant reddedilmeli" testi **yok**.
- Kill-switch `AgentRuntime`'a karşı **hiç** test edilmiyor.
- `finance.spend_within_budget` için "sahip onayladı ve bütçe aşıldı" kombinasyonu **hiç** test edilmiyor.
- Sandbox hash'leri yalnızca düz JSON değerleriyle test ediliyor — `Date`/`Map`/`Set` **hiç** denenmiyor.

**Öneri:** Her yaptırım kontrolü için en az bir *negatif entegrasyon* testi ekleyin: "kontrol devre dışıyken sistem gerçekten reddediyor mu?" Modül birim testi bu soruyu cevaplamıyor.

---

## 6. Önerilen düzeltme sırası

| Sıra | Bulgu | Gerekçe | Tahmini efor |
|---:|---|---|---|
| 1 | **F-01** | Para/hukuki yetkilendirme tamamen atlanabiliyor | Orta — gate + runtime + task tipi |
| 2 | **F-02** | Acil durdurma çalışmıyor | Küçük — runtime'a enjeksiyon |
| 3 | **F-03** | Üretimde sessiz işlevsel kilitlenme | Küçük — tek dal |
| 4 | **F-04** | Idempotens/replay kanıtı bozuk | Küçük — `stable()` düzeltmesi |
| 5 | F-05, F-08 | Katman tutarsızlığı ve bütçe tüketimi | Küçük–Orta |
| 6 | F-06, F-07 | Operatör deneyimi ve API yüzeyi | Küçük |
| 7 | F-09 … F-13 | Sağlamlaştırma | Küçük |
| 8 | F-14 + Bölüm 5 | Doküman düzeltmesi + negatif entegrasyon testleri | Orta |

---

## 7. Test yöntemi

Bulgular, deponun kendi test paketine ek olarak çalıştırılan altı senaryo betiğiyle üretildi:

| Senaryo | Kapsam |
|---|---|
| S1 | Dokümante edilen çekirdek döngünün uçtan uca mutlu yolu |
| S2 | Düşmanca yetkilendirme: uydurma onay, kill-switch, bütçe, secret referansı, 12 SSRF hedefi |
| S3 | Gönderilen `.env.example` ile üretim açılışı; gerçek diskte kontrol noktası/kurtarma/kurcalama |
| S4 | Determinizm ve hash çakışmaları, gateway matrisi, runtime eşzamanlılığı, planlayıcı kenar durumları, 12.000 vakalık defter fuzz'ı |
| S5 | Kirlenmiş vakaların temiz yeniden doğrulaması; secret zincirinin fail-closed davranışı; API yüzeyi denetimi |
| S6 | Üretim taşıma katmanına karşı DNS rebinding ve IPv6 ULA saldırıları |

Tüm bulgular yeniden üretildi ve gözlemlenen çıktılarla yukarıda belgelendi. `dist/` ve `node_modules/` dışında depoda hiçbir dosya değiştirilmedi.
