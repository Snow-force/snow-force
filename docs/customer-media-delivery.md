# Customer-first media delivery

## 管理员操作说明

1. 在后台原有活动、回顾或商品编辑页上传照片并保存。系统在顾客首次访问时生成四档 WebP 预览，原图保留；不需要手动压缩历史照片或建立新存储桶。
2. 换照片时重新上传，保存新生成的图片地址。不要在 Storage 中覆盖同名文件：浏览器会长期缓存旧地址。
3. 发布前在可用的测试环境打开活动封面、回顾相册和商品图片；逐张打开大图，再重启应用检查。确认预览对象出现在原桶的 `_web/v1/` 中。正式发布前先访问重点封面完成预热。
4. 技术人员可在浏览器 Network 中检查 `/api/media/image`：成功返回 `image/webp`，带一年缓存和 ETag；再次访问或重启后的请求应复用 `memory` 或 `storage`，而不是再次读取原图。浏览器直接命中缓存时可能不会发送请求。
5. 相册先显示六张，点击「查看更多照片」逐批展开；首页只展示三张回顾封面。视频点击播放后才下载。
6. 若图片持续不可用，先检查 Storage 服务状态、服务端密钥和上传权限。账户额度限制需要在供应商侧恢复，本功能不能解除限制。删除敏感或误发照片时，应由技术人员同时处理原图、对应 `_web` 目录及已缓存的公开响应；不要把私密资料放入这些公开桶。

## What customers see

The home page now follows one path: find a trip → understand registration → see a few community stories → browse available gear. The departure board remains the main event discovery surface. Repeated event cards, a scroll-driven album, repeated promotional sections, and an empty shop promotion no longer sit between a visitor and a decision. The video source is attached only after Play; initial browsing does not fetch its metadata or video bytes.

The recap index uses compact cover cards and shows six stories at a time. A story's album uses one responsive grid rather than separate mobile and desktop image trees. It initially mounts six photo previews; customers can show six more or open one full-screen preview. Existing keyboard navigation, close/focus restoration, zoom, and rotation remain available. Booking, payments, waivers, account access, policies, and support remain in their existing modules.

## How public photo caching works

`PublicImage` routes photos from the configured Supabase project's three existing public buckets (`recap-media`, `event-covers`, `shop-products`) through `/api/media/image?src=…&w=640&v=v1`. Local assets, QR codes, and other image sources retain their existing image handling.

On a successful first miss, the website downloads the original once and produces WebP previews with long edges bounded by 320, 640, 1280, and 1920 pixels. Each preview is limited to 384 KiB; quality and dimensions can decrease to meet that budget. EXIF is stripped, GIF previews use the first frame, and original files remain untouched.

The previews are persisted in the original public bucket under `_web/v1/<sha256-of-source-url>/<width>.webp`. They survive application restarts and deployments without an extra volume, new bucket, or new paid service. Subsequent processes read the small stored preview, not the original. Different widths arriving together share one generation job per source in a process; a bounded generation queue serializes decoding, and a 16 MiB memory LRU avoids repeat storage reads during a process's lifetime. Across simultaneous independent replicas, more than one initial generation can occur; duplicate writes are tolerated. Persisted previews are shared across replicas afterwards.

Successful HTTP responses are public/immutable for one year and include an ETag, content length, and `X-Snowforce-Media-Cache` (`generated`, `coalesced`, `storage`, or `memory`). Conditional requests can return 304. Cache hits still transfer preview bytes when a client or server must fetch the preview; this is not zero Storage egress.

## Replacement and invalidation

Public photo URLs are immutable. To replace an image, use the existing upload workflow, which creates a new object name, and save that new URL. The new source URL automatically produces a different preview namespace. Do not overwrite a public image in place and expect immutable browser caches to update.

If preview encoding rules change, bump `MEDIA_VERSION` in `delivery-policy.ts`. The loader includes the version in the client URL, so browsers and edge caches request the new representation. Source images are retained for regeneration. Deleting original photos does not purge previously cached public responses or existing derivative objects; staff must remove unused `_web` namespaces as part of a planned removal and respect already-issued public cache lifetimes. Never use this mechanism for protected documents, waivers, identity photos, signed URLs, or other access-controlled material.

## Limits and rollout

Only HTTPS images on the configured project's exact origin and an allowed public bucket are accepted. Arbitrary hosts, signed/query-bearing URLs, recursive `_web` sources, traversal, SVG, and unbounded sizes are rejected. Network reads have a timeout and streaming size limit; redirects are refused. Original inputs are capped at 20 MiB and 60 million decoded pixels. Generation and failures have bounded queues/backoff. Errors return no-store responses rather than caching a broken placeholder or revealing provider errors.

The Storage adapter recognizes the provider's HTTP-400 JSON missing-object response as well as transport 404; quota, permission, missing-bucket and other errors remain failures. Missing-object classification reads at most 4 KiB. Public preview requests bypass the member session proxy, so images do not trigger authentication refreshes or carry refreshed session cookies.

The website's existing server-only Supabase secret key must be able to insert new WebP objects into those buckets. No private key enters the browser. Existing MIME and size limits must permit WebP up to 384 KiB. This implementation neither changes storage RLS nor provisions resources. When Storage is restricted/unavailable, generation and uncached preview reads can fail; the existing visible image fallback is used. Cache code cannot lift provider account restrictions or erase usage already billed.

Before enabling this release, use a staging environment with working Storage to request representative images in all four widths, verify the persisted `_web` objects, and repeat after an app restart. Once available, warm important covers before announcing the release. Monitor both cached and uncached egress and original-object requests after rollout. Extra preview storage is bounded per source/version (four files of at most 384 KiB each); plan cleanup of obsolete versions separately.

## Verification record

Automated tests cover source isolation, width/version cardinality, conditional responses, byte/dimension limits, concurrent requests, bounded memory, restart reuse, storage failures, bilingual journeys, and progressive album loading.

An isolated local TLS storage fixture and a copy of the built standalone app were used for an HTTP comparison with `public/team/group.jpg` (295,360 bytes). The fixture copy permits loopback upstreams solely to exercise the existing Next image optimizer; the checked-in production configuration retains its private-IP protection.

| Scenario | Original reads | Original bytes |
|---|---:|---:|
| Existing Next optimizer, four cold widths | 4 | 1,181,440 |
| New delivery, same four cold widths | 1 | 295,360 |
| Further warm requests | 0 additional | 0 additional |
| App process restarted, durable previews retained | 0 additional | 0 additional |

Generated WebP sizes for this fixture were 9,766 / 29,190 / 84,346 / 120,576 bytes at the four supported widths. The final HTTP comparison used Supabase's HTTP-400/JSON-404 missing-object format. A member-cookie request caused zero authentication calls and returned no `Set-Cookie` header. These are fixture measurements, not a forecast of production bills. Production media migration and end-to-end Storage writes must be verified against an available provider before rollout.
