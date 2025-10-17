# Résolution des erreurs de contraintes de clés étrangères

## Date: 16 Octobre 2025

## Problèmes identifiés

### 1. Erreur 403 lors de l'appel au patient suivant
**Cause**: Politique RLS incorrecte sur la table `queue_overrides` après modification des contraintes FK.

**Solution**: Migration `20251016070000_update_queue_overrides_policy.sql`
- Mise à jour de la politique d'insertion pour utiliser `auth.uid()` correctement avec les nouvelles FK vers `profiles`

### 2. Erreur 400 lors de la complétion des rendez-vous
**Cause**: Conflit de nom de contrainte entre le code TypeScript et la base de données.

**Solution**: 
- Migration `20251016080000_fix_appointment_update_conflicts.sql` qui a renommé `appointments_patient_fkey` en `appointments_patient_id_fkey`
- Mise à jour du code TypeScript dans `QueueRepository.ts` pour utiliser le nouveau nom de contrainte

### 3. Erreur 400 lors du chargement de la file d'attente
**Cause**: Le code utilisait l'ancien nom de contrainte `appointments_patient_fkey` alors que la base de données utilisait `appointments_patient_id_fkey`.

**Solution**: Mise à jour de toutes les références dans le code TypeScript.

## Modifications apportées

### Migrations Supabase

1. **20251016070000_update_queue_overrides_policy.sql**
   - Met à jour la politique RLS pour `queue_overrides`
   - Permet aux propriétaires et au personnel de clinique de créer des overrides

2. **20251016080000_fix_appointment_update_conflicts.sql**
   - Renomme la contrainte `appointments_patient_fkey` en `appointments_patient_id_fkey`
   - Ajoute un index sur `appointments.updated_at`

### Code TypeScript

**Fichier**: `src/services/queue/repositories/QueueRepository.ts`

Mises à jour dans 4 endroits :
1. Méthode `getQueueByDate()` - ligne ~41
2. Méthode `getQueueEntryById()` - ligne ~91
3. Méthode `addToQueue()` - ligne ~132
4. Méthode `updateQueueEntry()` - ligne ~184

**Changement**: Remplacement de `appointments_patient_fkey` par `appointments_patient_id_fkey` dans toutes les requêtes `.select()`

Exemple:
```typescript
// AVANT
patient:profiles!appointments_patient_fkey(id, full_name, phone_number, email)

// APRÈS
patient:profiles!appointments_patient_id_fkey(id, full_name, phone_number, email)
```

**Fichier**: `src/services/queue/repositories/QueueRepository.ts` - Méthode `createQueueOverride()`

Ajout de validation pour vérifier que le profil existe avant d'insérer dans `queue_overrides`.

## État actuel de la base de données

### Contraintes importantes

```sql
-- Table appointments
CONSTRAINT appointments_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES public.profiles(id)

-- Table queue_overrides  
CONSTRAINT queue_overrides_performed_by_fkey 
  FOREIGN KEY (performed_by) REFERENCES public.profiles(id)

-- Table clinic_staff
CONSTRAINT clinic_staff_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id)
```

## Tests à effectuer

Après le déploiement, vérifier que :

- ✅ La file d'attente se charge correctement sans erreur 400
- ✅ L'appel au patient suivant fonctionne sans erreur 403
- ✅ La complétion d'un rendez-vous fonctionne sans erreur 400
- ✅ Les audit trails sont créés correctement dans `queue_overrides`
- ✅ Les politiques RLS fonctionnent pour tous les rôles (propriétaire, personnel)

## Notes importantes

1. **Cache Supabase**: Après les modifications de contraintes, il peut être nécessaire d'attendre quelques minutes pour que le cache de schéma Supabase se mette à jour.

2. **Cohérence**: Le nom de contrainte `appointments_patient_id_fkey` doit être maintenu dans la base de données ET dans le code TypeScript.

3. **Futures migrations**: Ne pas renommer les contraintes utilisées pour les relations dans les requêtes Supabase sans mettre à jour le code correspondant.

## Commandes de déploiement

1. Migrations déjà exécutées dans Supabase Cloud ✅
2. Rebuild de l'application: `npm run build` ✅
3. Déploiement sur l'environnement de production (à faire)
