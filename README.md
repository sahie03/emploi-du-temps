# EDT Scolaire — version complète de démarrage

## Stack
- Node.js + Express
- SQLite pour démarrer facilement
- bcryptjs pour les mots de passe
- JWT pour les sessions
- Interface responsive

## Lancer localement
1. Installer Node.js 18+
2. Dans ce dossier : `npm install`
3. Définir une clé : `JWT_SECRET=une-cle-secrete-longue`
4. Lancer : `npm start`
5. Ouvrir http://localhost:3000

## Déploiement Render
- Build command : `npm install`
- Start command : `npm start`
- Ajouter `JWT_SECRET`.
- Pour une vraie production multi-établissements, remplacer SQLite par PostgreSQL et utiliser un disque persistant si SQLite est conservé.

## Prochaine étape fonctionnelle
Ajouter les affectations enseignant-matière-classe, les disponibilités, les salles spécialisées et un moteur de contraintes plus avancé.