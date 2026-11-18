# Maison Domino

Prototype web de dominos Bloc, réalisé avec React, TypeScript et React-Konva.

## Démarrer

```bash
npm install
npm run dev
```

Ouvrir l'adresse indiquée par Vite. `npm test` exécute les tests du moteur et `npm run build` vérifie et construit l'application.

## État du projet

La partie locale contre trois adversaires virtuels est disponible. Les 28 dominos sont distribués, le plus grand double ouvre, il n'y a pas de pioche, et un joueur bloqué passe. Une manche se termine lorsqu'une main est vide ou que tous passent. Le gagnant unique marque la somme des points adverses ; en cas d'égalité au blocage, aucun point n'est attribué. La nouvelle partie remet les scores à zéro.

## Multijoueur

Le bouton « Jouer entre amis » permet de créer ou rejoindre un salon avec un code à huit caractères, puis de lancer une manche de deux à quatre joueurs. Les coups et les passages sont validés dans PostgreSQL ; chaque joueur ne reçoit que sa propre main. Les changements sont signalés par Supabase Realtime sur un canal privé ; un rafraîchissement de secours est effectué toutes les 15 secondes.

Les migrations dans `supabase/migrations/` ont été appliquées au projet Supabase connecté. Pour un autre projet, appliquez-les dans l'ordre via les migrations Supabase, activez les connexions anonymes dans Auth, puis copiez `.env.example` vers `.env.local` et renseignez l'URL et la clé publiable. Ne mettez jamais de clé secrète dans l'application web. Redémarrez Vite après modification des variables.

Les sessions anonymes restent liées au navigateur : effacer ses données empêche de retrouver sa session. La reconnexion au salon est possible dans le même onglet tant que sa session est conservée. Quitter explicitement libère la place ; si une manche est en cours, elle est annulée. Une nouvelle manche démarre automatiquement après un décompte de cinq secondes, tant qu'au moins deux joueurs restent et que le score cible n'est pas atteint. Un client connecté déclenche la reprise ; le serveur vérifie le délai et empêche les distributions concurrentes.

Les tentatives de rejoindre un salon sont limitées par compte (20 par 10 minutes). Cette mesure ne suffit pas contre la création massive de comptes anonymes : configurer un CAPTCHA et des limites IP côté Supabase avant une mise en production. Une fermeture de navigateur ou une coupure réseau ne provoque pas de départ automatique, et les salons abandonnés ne sont pas encore nettoyés automatiquement.
