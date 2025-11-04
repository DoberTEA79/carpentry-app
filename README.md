# CARPENTRY — Starter (Vite + React + Tailwind)

Це готовий мінімальний проект, щоб **з нуля** запустити веб-додаток і почати роботу.

## 1) Встановлення
```bash
npm ci
```

## 2) Налаштування середовища
Створи файл `.env` у корені і встав свій URL веб-аппу Google Apps Script:

```env
VITE_ORDERS_API_URL=https://script.google.com/macros/s/ВАШ_WEB_APP_ID/exec
```

(Якщо ще немає бекенду — зайди у Canvas і візьми файл **Google Apps Script — Orders API v1 (Sheets backend)**, задеплой як Web App і скопіюй URL.)

## 3) Режим розробки
```bash
npm run dev
```
Відкрий: http://localhost:5173/

## 4) Сторінки
- `/constructor` — екран Конструктора (кнопка **«В РОБОТУ»** шле дані на GAS).
- `/kitting` — демо Комплектовки (офлайн-моки).
- `/operator` — заготовка.

## 5) Білд і деплой
```bash
npm run build
npm run preview
```

Рекомендую **Vercel**: додай репозиторій, змінну оточення `VITE_ORDERS_API_URL`, і все.

---

### Примітка
- У файлі `src/pages/Constructor.tsx` логіка «агрегації дублікатів» і відправка `create_order` вже реалізовані.
- Далі додамо Operator UI, AX та друк наклейок.
