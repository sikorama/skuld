# Todo

Gestionnaire de tâches minimaliste, sans dépendance (Node.js stdlib
uniquement — `http` + `node:sqlite`), déployable sur un NAS.

## Fonctionnalités

- Catégories (ex : code, jardin, travaux maison), renommables, réordonnables
  par glisser-déposer, supprimables (avec leurs tâches).
- Tâches sans dépendances, sans estimation, sans échéance — juste un statut :
  **à faire / en cours / fait**.
- Vue **Kanban** : glisser une carte d'une colonne à l'autre.
- Vue **Liste** : même contenu, groupé par statut, changement de statut via
  menu déroulant.
- Titre de tâche éditable en place (clic dedans, `Entrée` ou clic ailleurs
  pour valider).

## Déploiement

Requiert **Node.js ≥ 22.5** (pour `node:sqlite`).

```bash
node server.js            # http://localhost:8322
PORT=9000 node server.js  # pour changer de port
```

`todo.db` (SQLite) est créée automatiquement au premier lancement et est
l'unique source de vérité — aucune base externe, aucune étape de build.

## Structure

- `lib/db.js` — schéma SQLite et connexion
- `server.js` — API REST + fichiers statiques
- `public/` — front-end (HTML/CSS/JS vanilla, sans build)
