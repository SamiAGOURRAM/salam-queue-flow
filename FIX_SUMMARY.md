# Résumé des corrections - Système de gestion de file d'attente

**Date:** 16 octobre 2025  
**Problèmes résolus:** Erreurs 403 (Forbidden) et 400 (Bad Request) lors des opérations de file d'attente

## Problèmes rencontrés

### 1. Erreur 403 lors de l'appel du patient suivant
**Cause:** Les politiques RLS (Row Level Security) pour la table `queue_overrides` ne correspondaient pas aux nouvelles contraintes de clés étrangères.

**Solution:** Création de la migration `20251016070000_update_queue_overrides_policy.sql` pour mettre à jour les politiques RLS.

### 2. Erreur 400 lors du chargement de la file d'attente
**Cause:** Le code TypeScript utilisait le nom de contrainte `appointments_patient_fkey` alors que la base de données utilisait `appointments_patient_id_fkey`.

**Solution:** Mise à jour de tous les appels à l'API Supabase pour utiliser le nom de contrainte correct.

### 3. Erreur 400 lors de la complétion des visites
**Cause:** Même problème de nom de contrainte + tentative d'insertion de colonnes inexistantes dans `absent_patients`.

**Solution:** Correction des noms de contraintes et suppression des références aux colonnes inexistantes.

## Modifications apportées

### Migrations Supabase créées

1. **20251016070000_update_queue_overrides_policy.sql**
   - Mise à jour de la politique d'insertion pour `queue_overrides`
   - Alignement avec les nouvelles contraintes FK

2. **20251016080000_fix_appointment_update_conflicts.sql**  
   - Ajout d'index pour améliorer les performances
   - ⚠️ Cette migration a renommé la contrainte (problème)

3. **20251016090000_revert_constraint_rename.sql**
   - ⚠️ **NE PAS EXÉCUTER** - Supprimée car non nécessaire

### Modifications du code TypeScript

**Fichier:** `src/services/queue/repositories/QueueRepository.ts`

Toutes les requêtes Supabase ont été mises à jour pour utiliser le nom de contrainte correct:

```typescript
// AVANT
patient:profiles(id, full_name, phone_number, email)

// APRÈS  
patient:profiles!appointments_patient_id_fkey(id, full_name, phone_number, email)
```

**Emplacements modifiés:**
- `getQueueByDate()` - ligne ~41
- `getQueueEntryById()` - ligne ~91
- `createQueueEntry()` - ligne ~132
- `updateQueueEntry()` - ligne ~184
- `createAbsentPatient()` - ligne ~323 (+ suppression colonnes inexistantes)

### Modifications dans QueueRepository.ts

#### createAbsentPatient()
Suppression des colonnes inexistantes `marked_by` et `reason` qui ne font pas partie du schéma de la table `absent_patients`.

```typescript
// AVANT
.insert({
  appointment_id: appointmentId,
  clinic_id: clinicId,
  patient_id: patientId,
  marked_by: markedBy,  // ❌ Colonne inexistante
  reason,                // ❌ Colonne inexistante
})

// APRÈS
.insert({
  appointment_id: appointmentId,
  clinic_id: clinicId,
  patient_id: patientId,
  // marked_by et reason supprimés
})
```

#### createQueueOverride()
Ajout de vérification du profil utilisateur avant insertion:

```typescript
// Vérification que le profil existe
const { data: profileData } = await supabase
  .from('profiles')
  .select('id')
  .eq('id', createdBy)
  .single();
  
if (!profileData) {
  // Fallback sur l'utilisateur courant
  const { data: currentUser } = await supabase.auth.getUser();
  createdBy = currentUser.user.id;
}
```

## Structure de la base de données (Référence)

### Table: appointments
```sql
CONSTRAINT appointments_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
```

### Table: queue_overrides
```sql
CONSTRAINT queue_overrides_performed_by_fkey 
  FOREIGN KEY (performed_by) REFERENCES public.profiles(id)
```

### Table: absent_patients
```sql
-- Colonnes réelles:
id, appointment_id, clinic_id, patient_id,
marked_absent_at, returned_at, new_position,
notification_sent, grace_period_ends_at,
auto_cancelled, created_at, updated_at

-- ❌ Colonnes qui N'EXISTENT PAS:
marked_by, reason
```

## Instructions de déploiement

### 1. Migrations Supabase
Exécuter dans l'ordre:
```bash
# Déjà exécutées:
✅ 20251016070000_update_queue_overrides_policy.sql
✅ 20251016080000_fix_appointment_update_conflicts.sql
✅ 20251016090000_revert_constraint_rename.sql

# Ne plus exécuter de nouvelles migrations
```

### 2. Code TypeScript
```bash
# Reconstruire l'application
npm run build

# Déployer la nouvelle version
# (selon votre processus de déploiement)
```

## Résultats attendus

Après ces corrections, les fonctionnalités suivantes devraient fonctionner correctement:

✅ Chargement de la file d'attente  
✅ Appel du patient suivant  
✅ Complétion des rendez-vous  
✅ Marquage des patients absents  
✅ Création des enregistrements d'audit (queue_overrides)

## Points d'attention futurs

1. **Cohérence des noms de contraintes:** Toujours utiliser le nom complet de la contrainte FK dans les requêtes Supabase avec la syntaxe `!constraint_name`.

2. **Schéma de base de données:** Avant d'ajouter des colonnes dans le code, vérifier qu'elles existent réellement dans la base de données.

3. **Politiques RLS:** Lors de la modification des contraintes FK, toujours mettre à jour les politiques RLS correspondantes.

4. **Cache Supabase:** Après des modifications de schéma, il peut être nécessaire d'attendre quelques minutes que le cache Supabase se rafraîchisse.

## Tests recommandés

1. ✅ Charger le dashboard de la file d'attente
2. ✅ Ajouter un patient à la file d'attente  
3. ✅ Appeler le patient suivant
4. ✅ Compléter un rendez-vous
5. ✅ Marquer un patient comme absent
6. ✅ Vérifier que les enregistrements d'audit sont créés

## Support

En cas de problème persistant:
1. Vérifier les logs de la console navigateur pour les erreurs détaillées
2. Vérifier les logs Supabase pour les erreurs SQL
3. Vérifier que toutes les migrations ont été exécutées correctement
4. Effacer le cache du navigateur et recharger l'application

---

**Dernière mise à jour:** 16 octobre 2025, 15:15 GMT
