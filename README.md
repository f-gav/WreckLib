# WreckLib

Отдельная энциклопедия RPG-кампаний, визуально совместимая с **WreckTrack**.
Отдельные GitHub-репозиторий, база Supabase и учётные записи. WreckTrack и At your service! не изменяются.

## Состояние (25.10.2026)

- SQL-схема и отдельная hardening-миграция развёрнуты в **WreckLib** (`nwlthntpkmgrhmejhfqk`): кампании, участники, записи, секреты, приглашения.
- На всех пяти таблицах включена RLS; хранилище `wrecklib-images` приватное.
- В клиенте присутствуют Email Magic Link, роли Мастер/Игрок+/Игрок, папки и карточки, изображения WebP, приглашения по email.
- В `public/config.js` указан **только публичный ключ**, допускаемый в браузере. Секреты в клиенте запрещены.
- Предусмотрена публикация GitHub Pages через `.github/workflows/deploy.yml`. Статус Pages необходимо проверить отдельно.
- Прототип не объявлен готовым к публичному использованию до ручной проверки входа, отдельных пользователей и RLS.

## Адрес и авторизация

Предполагаемый URL: https://f-gav.github.io/WreckLib/

В [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/nwlthntpkmgrhmejhfqk/auth/url-configuration)
установить **Site URL**: `https://f-gav.github.io/WreckLib/`, а в **Redirect URLs** добавить:
- `https://f-gav.github.io/WreckLib/`
- `https://f-gav.github.io/WreckLib/**`

Email Magic Link использует тот же адрес и сохраняет параметр `?invite=...` при входе.
Если GitHub Pages отключён, открыть Settings → Pages, выбрать **GitHub Actions**.
В настройках источника не выбирать устаревшую Cloudflare-сборку.

## Проверки

```sh
npm run check
node --check public/app.js
node --check public/config.js
```

CI выполняет статические тесты на push и pull request. Это **не** замена браузерного E2E и RLS-тестов с несколькими аккаунтами.

## Дальнейший порядок

1. Проверить публикацию, Magic Link, создание кампании, приглашения, доступ к картинкам.
2. Привести CSS, темы, шрифты и навигацию к текущей визуальной системе WreckTrack.
3. Доработать структуру материалов, редактирование, поиск, Markdown и перекрёстные ссылки.
4. Провести тесты доступа Мастер/Игрок+/Игрок на нескольких аккаунтах и проверить конкурентные изменения.
5. История редакций, корзина, экспорт/импорт и экономия Storage.
6. Итоговые E2E-тесты и выпуск.

## Исторический код

`worker/`, `wrangler.jsonc`, `migrations/0001_init.sql` — неподдерживаемые Cloudflare-черновики.
**Не использовать их для развёртывания**. Актуальные миграции: `supabase/001_init.sql` и `supabase/002_hardening.sql`.
