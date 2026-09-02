# İleri Seviye Kullanım Testi Raporu

**Proje:** autonomous-income-agent
**Test edilen commit:** `57c377d` (dal: `claude/autonomous-income-agent-testing-jlnzmv`; kaynak kod `main` ile aynı)
**Tarih:** 2026-09-02
**Ortam:** Node v22.22.2, Linux
**Önceki tur:** [`docs/UAT_RAPORU.md`](./UAT_RAPORU.md) — 14 bulgu (1 kritik, 3 yüksek, 4 orta, 6 düşük)

**Bu turun kapsamı:** İlk tur "sistem doğru kullanıldığında ne yapıyor, kötü niyetli girdiye ne diyor" sorularını yanıtladı. Bu tur farklı bir soruya bakıyor: **sistem gerçek üretim koşullarında — asenkron işler, eşzamanlı yazmalar, uzun ömürlü süreçler, yanıt vermeyen bağımlılıklar altında — ayakta kalıyor mu?**

Yöntem: property-based invaryant testi (binlerce rastgele ama tekrarlanabilir vaka), eşzamanlılık yarış testi, çökme enjeksiyonu, ölçek/performans profilleme ve düşmanca serileştirme.

---

## 1. Yönetici özeti

**14 yeni bulgu** tespit edildi; 4'ü yüksek önemde. Hiçbiri ilk turdakilerle çakışmıyor — bunlar yalnızca sistem gerçekçi koşullar altında zorlandığında ortaya çıkıyor.

Ana tema değişti. İlk turun teması "kontroller yazılmış ama bağlanmamış"tı. Bu turun teması şu:

> **Sistem senkron, tek iş parçacıklı, kısa ömürlü ve her zaman yanıt veren bir dünya varsayıyor.** Gerçek bir otonom ajan bu dünyada yaşamıyor.

Üç somut sonuç:

1. **R7'nin "replay evidence" katmanı gerçek iş yüklerinde hiçbir şey kanıtlamıyor.** `DeterministicSandbox.execute()` senkron bir yürütücü imzası alıyor. Ancak gerçek her efekt (ağ, dosya sistemi, ödeme) asenkrondur — ve runtime'ın kendi `CapabilityExecutor` tipi de `Promise` döndürüyor. Bir Promise `stable()` tarafından `{}` olarak serileştirildiği için **bütün asenkron adımlar aynı hash'i alıyor**, makbuz iş daha bitmeden `status: "completed"` yazılıyor, ve **başarısız olan bir ödeme hem "tamamlandı" olarak kaydediliyor hem de süreci çökertiyor.**

2. **Üç ayrı dayanıklılık mekanizması, tam da devreye girmeleri gereken anda başarısız oluyor:** denetim zinciri kuyruktan kırpmayı görmüyor, eşzamanlı checkpoint yazma denemelerin %85'inde checkpoint'i tamamen kaybediyor, ve yanıt vermeyen bir bağımlılık runtime'ı kalıcı olarak kilitliyor.

3. **Buna karşılık karar sisteminin matematiği kusursuz çıktı.** 2.000 rastgele fırsat × 9 metrik üzerinde monotonluk ihlali yok; 3.000 rastgele değerlendirme rubriğinde aralık/monotonluk ihlali yok; 500 rastgele defterde sıra bağımsızlığı ve tam sayı dağıtım kesinliği %100. Bu katman sağlam.

### Bulgu dağılımı

| Önem | Adet | Bulgular |
|---|---:|---|
| Yüksek | 4 | A-01, A-02, A-03, A-04 |
| Orta | 4 | A-05, A-06, A-07, A-08 |
| Düşük | 6 | A-09 … A-14 |

---

## 2. Bulgular

### 🟠 A-01 — YÜKSEK: Sandbox senkron; asenkron efektler için makbuzlar anlamsız ve süreç çöküyor

**Dosya:** `src/recovery/sandbox.ts:49-70`

`execute()` imzası senkron bir yürütücü bekliyor:

```ts
execute(step: SandboxStep, executor: (input: unknown) => unknown): SandboxReceipt
```

Ancak runtime'ın kendi yürütücü tipi asenkron (`src/runtime/executor-registry.ts`: `=> Promise<unknown>`), ve gerçek hayattaki her efekt — HTTPS çağrısı, dosya yazma, ödeme tahsilatı — asenkrondur. Bir Promise geçirildiğinde:

**Gözlemlenen çıktı — bir ödeme tahsilatı:**

```
receipt immediately after execute(): status=completed  outputHash=44136fa355b3678a...
side effect actually completed yet? charged=0          ← tahsilat henüz yapılmadı
outputHash of the async step : 44136fa355b3678a1146ad16f7e8649e
outputHash of literal {}      : 44136fa355b3678a1146ad16f7e8649e   ← aynı
```

`44136fa3...` = SHA-256("{}"). Üç ayrı sonuç doğuruyor:

**(a) Makbuz iş bitmeden "tamamlandı" yazıyor.** Checkpoint alınırsa, henüz gerçekleşmemiş bir yan etki "tamamlandı" olarak kalıcılaşır. Yeniden başlatmada bu adım atlanır — **R7'nin tam olarak önlemeyi vaat ettiği durum: kayıp yan etki.**

**(b) Bütün asenkron adımlar birbirinden ayırt edilemez:**

```
{chargeId:"ch_AAA", amount:100}    -> 44136fa355b3678a...
{chargeId:"ch_BBB", amount:999999} -> 44136fa355b3678a...   ← aynı hash
```

**(c) Başarısız bir efekt "tamamlandı" olarak kaydediliyor VE ajanı çökertiyor:**

```
receipt after a REJECTED payment: status=completed
checkpoint would record: {"stepId":"fail",...,"status":"completed"}
unhandled rejection reached the process: Error: payment declined
```

Node 22'nin varsayılan `--unhandled-rejections=throw` davranışıyla bu, **süreci sonlandırır.** Yani reddedilen bir ödeme aynı anda hem sahte bir "başarılı" makbuz üretiyor hem de ajanı düşürüyor. Test betiğim bu noktada gerçekten çöktü.

**Öneri:** `execute()`'u `async` yapın ve yürütücüyü `await` edin; makbuzu ancak efekt çözümlendikten sonra üretin; reddi yakalayıp `status: "failed"` gibi ayrı bir durumla kaydedin (bugün `SandboxReceipt.status` yalnızca `"completed"` değerini alabiliyor — bu tip de genişletilmeli).

---

### 🟠 A-02 — YÜKSEK: Denetim zinciri kuyruktan kırpmayı tespit etmiyor

**Dosya:** `src/audit/hash-chain.ts:45-59`

`verifyAuditChain` zinciri baştan sona yürüyor ve her olayın `previousHash`'ini doğruluyor. Bir **önek (prefix)** her zaman geçerli bir zincirdir — dolayısıyla sondan silmek tespit edilemiyor.

**Gözlemlenen tamper matrisi** (10 olaylık gerçek bir zincir; 9. olay `finance.transfer_funds`):

| Değişiklik | Tespit |
|---|---|
| Zincir ortasında bir `reason` düzenleme | ✅ |
| İki komşu olayın yerini değiştirme | ✅ |
| Ortadan bir olay silme | ✅ |
| İlk olayı silme | ✅ |
| `approvalId` sahteleme | ✅ |
| `deny` kararını `allow`'a çevirme | ✅ |
| Sahte hash'li olay ekleme | ✅ |
| **Son 3 olayı kırpma (para transferi dahil)** | ❌ **TESPİT EDİLMEDİ** |
| **Tek olaya kırpma** | ❌ **TESPİT EDİLMEDİ** |
| **Boş zincire kırpma** | ❌ **TESPİT EDİLMEDİ** |

Denetim kaydına erişebilen biri, en son ne yapıldığını — örneğin bir para transferini — kaydı geçersiz kılmadan silebilir. `docs/SECURITY.md` "history modification after execution" tehdidini ele alındı sayıyor; kuyruktan kırpma bu kapsamın dışında kalıyor.

**Öneri:** Zincire monoton artan bir sıra numarası ekleyin ve `verifyAuditChain`'e beklenen uzunluk/son hash parametresi verin; ya da periyodik olarak imzalı bir "yüksek su işareti" (son hash + sayaç) uygulama sürecinin dışına yazın. `docs/SECURITY.md:35` bunu zaten öngörüyor ("persist signed audit checkpoints outside the application process") — henüz uygulanmamış.

---

### 🟠 A-03 — YÜKSEK: Eşzamanlı checkpoint yazma, checkpoint'i tamamen kaybediyor

**Dosya:** `src/recovery/file-checkpoint-store.ts:31-45`

Geçici dosya adı yalnızca PID ve milisaniyeden türetiliyor:

```ts
const tempPath = `${this.#path}.${process.pid}.${Date.now()}.tmp`;
await writeFile(tempPath, ..., { flag: "wx" });
await rename(tempPath, this.#path);
} finally {
  await unlink(tempPath).catch(...)   // ← diğer yazmanın dosyasını siliyor
}
```

Aynı süreçte, aynı milisaniyede iki `save()` **birebir aynı yolu** üretiyor. `wx` bayrağı ikincisini `EEXIST` ile reddediyor, ardından ikincinin `finally` bloğu **birincinin henüz `rename` edilmemiş geçici dosyasını siliyor** — birincinin `rename`'i de `ENOENT` ile düşüyor. Her iki yazma da başarısız, diskte checkpoint yok.

**Gözlemlenen çıktı (20 tekrar):**

```
runs where BOTH saves failed and no checkpoint remained: 17/20
individual save() rejections across 40 calls: 34
```

Denemelerin **%85'inde checkpoint tamamen kayboldu.** Bu, iki iş akışı aynı anda checkpoint aldığında sessizce kurtarma noktasının yok olması demektir — R7'nin "durable atomic recovery checkpoint persistence" iddiasının doğrudan karşıtı.

**Öneri:** Geçici dosya adına çarpışmayan bir bileşen ekleyin (`randomUUID()`), ve `finally` içindeki `unlink`'i yalnızca bu çağrının gerçekten oluşturduğu dosya için yapın. Ayrıca örnek başına bir yazma kuyruğu (mutex) ile `save()` çağrılarını serileştirin.

---

### 🟠 A-04 — YÜKSEK: Yürütme zaman aşımı yok; yanıt vermeyen bir bağımlılık actionId'yi kalıcı olarak kilitliyor

**Dosya:** `src/runtime/agent-runtime.ts:106-195`

`AgentRuntime.run()` yürütücüyü koşulsuz `await` ediyor (satır 128). Zaman aşımı yok. `AbortSignal` yalnızca yürütücü çağrısından **önce** (satır 106) ve **sonra** (satır 135, 161) kontrol ediliyor — devam eden çağrıyla yarıştırılmıyor.

**Gözlemlenen çıktı** (yürütücü: `() => new Promise(() => {})` — yanıt vermeyen bir üçüncü taraf API):

```
A. run() with no options:            STILL RUNNING after 1.5s
B. abort() fired 200ms in:           STILL RUNNING 1.3s after abort()
C. re-running the same actionId:     rejected_duplicate
```

Üç ayrı sorun:

1. **Zaman aşımı yok** — takılan bir görev süresiz bloke ediyor.
2. **İptal çalışmıyor** — `abort()` devam eden işi durdurmuyor; iptal yalnızca yürütücünün kendisi `signal`'ı dinlerse işe yarıyor (işbirlikçi iptal). Testte tetiklenmiş bir sinyal 1.3 saniye sonra hâlâ etkisizdi.
3. **actionId kalıcı olarak sıkışıyor** — `#inFlightActionIds` yalnızca `finally` bloğunda temizleniyor (satır 195), o da hiç çalışmıyor. Bu actionId artık **sonsuza dek** `rejected_duplicate` alıyor; onu serbest bırakabilecek hiçbir mekanizma yok. Süreç yeniden başlatılmadan o iş bir daha asla çalıştırılamaz.

Gateway kendi taşıma katmanında zaman aşımı uyguluyor (`timeoutMs`), ancak runtime seviyesinde koruma yok — ve gateway'den geçmeyen her yürütücü (ürün derleme, dosya işleme, LLM çağrısı) korumasız.

**Öneri:** `TaskRunOptions`'a `timeoutMs` ekleyin ve yürütücüyü `Promise.race` ile sınırlayın; iptal sinyalini de aynı yarışa dahil edin. Zaman aşımında actionId'yi in-flight kümesinden çıkarın ve `status: "failed"` (veya yeni bir `timed_out`) ile dönün.

---

### 🟡 A-05 — ORTA: `run()` her çağrıda tüm denetim geçmişini kopyalıyor (karesel maliyet)

**Dosya:** `src/runtime/agent-runtime.ts:21-23`, her `return` yolunda `audit: this.getAuditTrail()`

`getAuditTrail()` diziyi tamamen kopyalıyor (`[...this.#audit]`) ve `run()` bunu **her sonuçta** döndürüyor. Görev başına maliyet birikmiş geçmişle doğrusal büyüyor → toplamda karesel.

**Ölçüm** (aynı runtime örneği, artan geçmiş derinliğinde 200 çağrılık örneklemler):

| Denetim geçmişi | `run()` başına süre |
|---:|---:|
| 400 olay | 0.0342 ms |
| 10.800 olay | 0.0315 ms |
| 31.200 olay | 0.2135 ms |
| 61.600 olay | **0.4874 ms** |

En derin / en sığ = **14.3x**. Ayrıca denetim izi bellekte sınırsız: 10.000 görev 20.000 olay bırakıyor, budama veya kalıcılaştırma API'si yok. Sürekli çalışan bir ajan için hem yavaşlama hem bellek büyümesi.

**Öneri:** Sonuçta yalnızca o göreve ait olayları döndürün (veya salt-okunur bir görünüm); tam izi ayrı bir `getAuditTrail()` çağrısına bırakın. Kalıcı depoya aktarım ve budama için bir arayüz ekleyin.

---

### 🟡 A-06 — ORTA: Kimlik bilgisi ön ekinde CRLF enjeksiyonu (doğrudan kurulum yolunda)

**Dosya:** `src/production/network-transport.ts:249-251`

`send()` yalnızca **çözümlenmiş gizli değeri** CRLF'e karşı doğruluyor, birleştirilmiş başlık değerini değil:

```ts
if (secret.length === 0 || /[\r\n]/.test(secret)) throw new Error(...);
const value = `${binding.prefix ?? ""}${secret}`;   // ← prefix denetlenmiyor
```

**Gözlemlenen çıktı:**

```
header value handed to the requester:
{"header":"authorization","value":"Bearer \r\nX-Admin-Override: true\r\nX-Evil: s3cr3t"}
```

`loadProductionConfig()` ön ekteki CRLF'i **reddediyor** (`src/production/config.ts`), ancak `ProductionHttpsTransport` yapıcısına doğrudan `credentialBindings` verilen yolda bu kontrol yok. Yerleşik `nodePinnedHttpsRequester` kullanıldığında Node muhtemelen `ERR_INVALID_CHAR` ile reddeder (fail-closed), ancak özel bir `requester` enjekte edildiğinde değer olduğu gibi geçiyor.

**Öneri:** Doğrulamayı `secret` yerine birleştirilmiş `value` üzerinde yapın; ayrıca yapıcıda `prefix` için config'dekiyle aynı CRLF kontrolünü uygulayın.

---

### 🟡 A-07 — ORTA: 443 dışı port yapılandırması hazırlık kontrolünü geçiyor ama hiç çalışmıyor

**Dosya:** `src/production/network-transport.ts:214`, `src/production/readiness.ts`

`AIA_ALLOWED_ORIGINS=https://api.example.com:8443` yapılandırması:

```
config accepted origin: https://api.example.com:8443
readiness: ready                                    ← hazır diyor
request to that very origin: HTTPS port 8443 is not allowed by production policy.
```

`ProductionHttpsTransport` `allowedPorts` varsayılanı `[443]` ve **hiçbir kod bunu yapılandırmadan türetmiyor**. Yani operatör 443 dışı bir origin tanımlayabiliyor, hazırlık kontrolü `ready` diyor, ama o origin'e yapılan her istek reddediliyor. Sessiz yapılandırma tuzağı.

**Öneri:** `allowedPorts`'u `allowedOrigins`'ten türetin (her origin'in portunu otomatik ekleyin), ya da `parseOrigins` içinde 443 dışı portları açıkça reddedin.

---

### 🟡 A-08 — ORTA: Görev girdisi referansla geçiyor; yürütücü çağıranın nesnesini değiştirebiliyor

**Dosya:** `src/runtime/agent-runtime.ts:128`

```ts
const output = await executor(task.input, { ... });   // referans, kopya değil
```

**Gözlemlenen çıktı** (girdiye yazan bir yürütücü):

```
caller's task.input after the run: {"safe":true,"injected":"written by the executor"}
```

Bir yürütücü çağıranın görev nesnesini — ve o nesneyi paylaşan her şeyi (plan adımları, kuyruk kayıtları, denetim için tutulan bağlam) — sessizce değiştirebiliyor. Dikkat çekici olan, `DeterministicSandbox`'ın aynı sorunu doğru çözmüş olması: `executor(structuredClone(step.input))` (`sandbox.ts:60`). Runtime bu korumadan yoksun.

**Öneri:** Sandbox'takiyle aynı yaklaşımı uygulayın: `executor(structuredClone(task.input), ...)`.

---

### 🔵 A-09 — DÜŞÜK: Hız limiti saati çağıran tarafından belirleniyor

**Dosya:** `src/integrations/gateway.ts:81`

```ts
async execute(request: IntegrationRequest, now = Date.now())
```

`now` bir test kancası, ancak aynı zamanda limiti tamamen etkisiz kılıyor:

```
fixed clock, limit 3/min:                  3/50 allowed
caller advances the clock 2 min per call: 50/50 allowed
```

Çağıran zaten güven sınırının içinde olduğu için bu bir ayrıcalık yükseltme değil; ancak hız limiti bir **kontrol** değil, yalnızca bir **öneri** haline geliyor — hatalı bir yeniden deneme döngüsü de aynı etkiyi yaratabilir.

**Öneri:** Dahili olarak monoton bir saat kullanın; `now`'u yalnızca test için ayrı bir enjekte edilebilir saat nesnesiyle sağlayın ve geriye giden zaman damgalarını reddedin.

---

### 🔵 A-10 — DÜŞÜK: Kullanılmış nonce kümesi hiç budanmıyor

**Dosya:** `src/security/owner-authorization.ts:63, 92`

`#usedNonces` yalnızca büyüyor; süresi dolmuş onayların nonce'ları da kalıcı olarak tutuluyor.

```
after 20000 verified approvals, heap grew ~2.9 MB
```

Onayların zaten `expiresAt` alanı var — süresi geçmiş nonce'ların saklanmasına gerek yok. Sürekli çalışan bir ajanda sınırsız bellek büyümesi.

**Öneri:** Nonce'ları `expiresAt` ile birlikte saklayın ve süresi dolanları periyodik olarak budayın.

---

### 🔵 A-11 — DÜŞÜK: `TaskRunResult.error` tip sözleşmesi çalışma zamanında ihlal ediliyor

**Dosya:** `src/runtime/agent-runtime.ts:7-9`

```ts
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

`error.message` bir `Error` örneğinde bile string olmak zorunda değil. Düşmanca yürütücü testinde:

```
content.draft          error="a bare string, not an Error"     ← ok
product.design         error="obj"                             ← ok
product.build          error="null"                            ← ok
commerce.create_offer  error={"nested":"not a string"}         ← string değil
```

`TaskRunResult.error` `string | undefined` olarak tiplenmiş ama bir nesne taşıyor. Bu değeri loglayan veya birleştiren kod beklenmedik davranır. (Olumlu not: denetim zinciri bu vakaların hepsinde tutarlı kaldı.)

**Öneri:** `String(error.message)` ile sarın.

---

### 🔵 A-12 — DÜŞÜK: `MemoryStore.query({ limit: 0 })` bir kayıt döndürüyor

**Dosya:** `src/memory/store.ts:76`

```ts
const limit = Math.max(1, Math.floor(query.limit ?? 20));
```

`limit: 0` isteyen çağıran 1 kayıt alıyor. Sayfalama mantığında sessiz hataya yol açar. (Aynı `Math.max(1, ...)` kalıbı `planner/plan.ts:90`'da ilk turun F-10 bulgusunu doğurmuştu.)

**Öneri:** `limit: 0` için boş dizi döndürün; negatif değerleri reddedin.

---

### 🔵 A-13 — DÜŞÜK: Sert tavan kararı skoru 0'a eziyor, sıralama bilgisi kayboluyor

**Dosya:** `src/opportunity/scorer.ts:56, 66`

`legalRisk >= 0.8` veya `platformRisk >= 0.9` olduğunda skor `0` yazılıyor:

```
legalRisk=0.80, mükemmel ekonomi -> score=0     decision=discard
legalRisk=0.79, aynı ekonomi     -> score=0.789
zayıf ama yasal fırsat           -> score=0.144 decision=discard
```

Hukuken elenmiş bir fırsat, ekonomik olarak değersiz bir fırsattan **daha düşük** skor alıyor. `decision` alanı doğru; ancak skora göre sıralayan veya eşik uygulayan herhangi bir alt sistem "yasak" ile "değersiz"i ayırt edemez. Karar doğru, taşınan bilgi eksik.

**Öneri:** Hesaplanan skoru koruyun ve elenme nedenini ayrı bir alanda taşıyın (`decision` + `blockedBy: "legal_ceiling"`).

---

### 🔵 A-14 — DÜŞÜK: JSON dizisi içeren checkpoint iç hata veriyor

**Dosya:** `src/recovery/file-checkpoint-store.ts` → `sandbox.restore()`

Düşmanca checkpoint matrisinin tamamı doğru şekilde **reddedildi** (bu iyi), ancak biri temiz bir doğrulama hatası yerine iç `TypeError` üretiyor:

| Bozuk içerik | Sonuç |
|---|---|
| Kesik JSON | ✅ `Persisted recovery checkpoint contains invalid JSON.` |
| `null` | ✅ `Persisted recovery checkpoint must be an object.` |
| `[]` (dizi) | ⚠️ `Cannot read properties of undefined (reading 'trim')` |
| `receipts` dizi değil | ✅ bütünlük doğrulaması başarısız |
| `chainHash` eksik | ✅ bütünlük doğrulaması başarısız |
| Yinelenen `stepId` | ✅ bütünlük doğrulaması başarısız |
| 100.000 makbuz | ✅ reddedildi (1463 ms) |

Fail-closed davranış korunuyor; yalnızca hata mesajı operatöre bir şey anlatmıyor. Ayrıca 100k makbuzluk bir dosyanın reddedilmesi 1.5 saniye sürüyor — bozuk/düşmanca bir checkpoint dosyası açılışta gözle görülür gecikme yaratabilir.

**Öneri:** `load()` içinde dizi/nesne şekil kontrolünü açıkça yapın; makbuz sayısına bir üst sınır koyun.

---

## 3. Baskı altında sağlam çıkan katmanlar

Bu tur yalnızca hata aramadı; neyin gerçekten dayanıklı olduğunu da ölçtü. Aşağıdakiler **kırılmadı**:

### Karar sisteminin matematiği — kusursuz

| Invaryant | Vaka sayısı | İhlal |
|---|---:|---:|
| Pozitif metriği artırmak skoru düşürmemeli | 2.000 aday × 6 metrik | **0** |
| Risk metriğini artırmak skoru yükseltmemeli | 2.000 aday × 3 metrik | **0** |
| Skorlama deterministik | 3.000 | **0** |
| Skor her zaman [0,1] | 3.000 | **0** |
| Karar, belgelenen eşiklerle tutarlı | 3.000 | **0** |
| Değerlendirici ağırlıklı skoru [0,1] | 3.000 rubrik | **0** |
| Kriter skorunu artırmak sonucu düşürmemeli | 3.000 rubrik | **0** |
| Defter özeti ekleme sırasından bağımsız | 500 rastgele defter | **0** |
| Dağıtım hem kâr hem zararda tam | 500 rastgele defter | **0** |

### Origin normalizasyonu — tam isabet

| Varyant | Yetkili? | Doğru mu |
|---|---|---|
| `https://api.example.com/x` | evet | ✅ |
| `https://API.EXAMPLE.COM/x` | evet | ✅ |
| `https://api.example.com:443/x` | evet | ✅ |
| `https://api.example.com./x` (sondaki nokta) | hayır | ✅ |
| `https://аpi.example.com/x` (Kiril homograf) | hayır | ✅ |
| `https://evil.api.example.com/x` | hayır | ✅ |
| `https://api.example.com:8443/x` | hayır | ✅ |

### Diğer

- **Eşzamanlılık:** %40 geçici hata oranıyla 300 paralel görev — denetim zinciri tutarlı, 600 olayın 600'ü benzersiz kimlikli, başarılı görev sayısı yürütücü tamamlama sayısıyla birebir eşleşti.
- **Düşmanca yürütücüler:** çıplak string, nesne, `null` ve bozuk `message` fırlatan yürütücülerin hiçbiri denetim zincirini bozmadı.
- **Prototype pollution yok:** `{"__proto__":{"admin":true}}` yükü işlendikten sonra `Object.prototype.admin === undefined`.
- **Checkpoint bütünlüğü:** 7 düşmanca yükün 7'si de reddedildi.
- **Zincir ortası kurcalama:** 7 farklı mutasyonun 7'si de tespit edildi (yalnızca kuyruktan kırpma kaçtı — A-02).

---

## 4. Önerilen düzeltme sırası

| Sıra | Bulgu | Gerekçe | Efor |
|---:|---|---|---|
| 1 | **A-01** | Asenkron efektlerde makbuz yalan söylüyor + süreç çöküyor | Orta — `execute()` async'e çevrilmeli, `status` tipi genişletilmeli |
| 2 | **A-03** | Eşzamanlı yazmada checkpoint %85 kayboluyor | Küçük — `randomUUID()` + yazma kuyruğu |
| 3 | **A-04** | Takılan bağımlılık actionId'yi kalıcı kilitliyor | Küçük–Orta — `Promise.race` ile timeout + abort |
| 4 | **A-02** | Denetim kaydı kuyruktan sessizce kırpılabiliyor | Orta — sıra numarası veya dış yüksek su işareti |
| 5 | A-06, A-08 | Başlık enjeksiyonu ve girdi mutasyonu | Küçük — tek satırlık düzeltmeler |
| 6 | A-05, A-07 | Performans ve yapılandırma tuzağı | Küçük |
| 7 | A-09 … A-14 | Sağlamlaştırma | Küçük |

**İlk turla birleşik öncelik:** F-01 (imzasız onay para transferini yetkilendiriyor) hâlâ tek kritik bulgu ve listenin başında kalmalı. Ardından bu turun A-01/A-03/A-04'ü gelir — çünkü bunlar üretimde sessizce veri ve yan etki kaybettiriyor.

---

## 5. Test yöntemi

| Senaryo | Kapsam |
|---|---|
| ADV-1 | Denetim zinciri tamper matrisi (10 mutasyon) + artan geçmiş derinliğinde `run()` maliyeti profillemesi |
| ADV-2 | Sandbox asenkron/reddedilen efektler, prototype anahtarları, 13 yapısal hash sondası |
| ADV-3 | Eşzamanlı checkpoint yazma (20 tekrar), çökme sonrası artık `.tmp`, 7 düşmanca kalıcı yük |
| ADV-4 | CRLF başlık enjeksiyonu, port/hazırlık tuzağı, 7 origin varyantı, 20.000 onayla bellek büyümesi, saat manipülasyonu |
| ADV-5 | Property-based invaryantlar: 2.000 aday × 9 metrik monotonluk, 3.000 rubrik, 500 rastgele defter, hafıza sorgu invaryantları (tohumlu mulberry32 PRNG, tekrarlanabilir) |
| ADV-6 | Runtime dayanıklılığı: yanıt vermeyen yürütücü, iptal yarışı, düşmanca hatalar, girdi mutasyonu, 300 paralel görev stresi |

Tüm bulgular yeniden üretildi ve gözlemlenen çıktılarla yukarıda belgelendi. Kaynak kodda hiçbir değişiklik yapılmadı; bu tur da yalnızca rapor üretti.
