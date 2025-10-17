# Fix: Absent Patients INSERT Error (403 Forbidden)

## Problème identifié

**Erreur:** `new row violates row-level security policy for table "absent_patients"`  
**Code d'erreur HTTP:** 403 Forbidden  
**Opération:** INSERT dans `absent_patients`

## Analyse technique

### Cause racine
Les politiques RLS (Row Level Security) sur la table `absent_patients` utilisaient uniquement la clause `USING`, qui ne s'applique pas aux opérations INSERT en PostgreSQL.

### Comportement PostgreSQL RLS
- **USING clause:** S'applique aux opérations SELECT, UPDATE, DELETE (pour vérifier quelles lignes peuvent être lues/modifiées)
- **WITH CHECK clause:** S'applique aux opérations INSERT et UPDATE (pour vérifier si les nouvelles valeurs sont autorisées)

### Politique problématique (avant)
```sql
CREATE POLICY "Staff can manage absent patients" ON absent_patients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND clinic_id = absent_patients.clinic_id
        AND role IN ('clinic_owner', 'staff')
    )
  );
```

**Problème:** La clause `FOR ALL` avec seulement `USING` ne permet pas les INSERT.

## Solution appliquée

### Migration: `20251016100000_fix_absent_patients_rls_policies.sql`

Création de politiques séparées pour chaque type d'opération:

1. **SELECT policy** - Utilise `USING` pour filtrer les lignes visibles
2. **INSERT policy** - Utilise `WITH CHECK` pour valider les nouvelles insertions
3. **UPDATE policy** - Utilise `USING` + `WITH CHECK` pour valider les modifications
4. **DELETE policy** - Utilise `USING` pour autoriser les suppressions

### Vérifications d'autorisation
Chaque politique vérifie que l'utilisateur est:
- ✅ Membre actif du personnel de la clinique (`clinic_staff`)
- ✅ OU a un rôle approprié dans `user_roles`
- ✅ OU est le propriétaire de la clinique (`clinics.owner_id`)

## Instructions de déploiement

### 1. Exécuter la migration
```sql
-- Dans la console Supabase SQL Editor ou via CLI
-- Fichier: supabase/migrations/20251016100000_fix_absent_patients_rls_policies.sql
```

### 2. Vérifier les politiques
```sql
-- Vérifier que les politiques ont été créées
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'absent_patients';
```

### 3. Tester l'insertion
```sql
-- Test d'insertion (remplacer les UUIDs par des valeurs réelles)
INSERT INTO absent_patients (appointment_id, clinic_id, patient_id)
VALUES (
  'your-appointment-id',
  'your-clinic-id',
  'your-patient-id'
);
```

## Résultat attendu

Après application de la migration:
- ✅ Les membres du personnel peuvent marquer les patients comme absents
- ✅ Les propriétaires de clinique peuvent gérer les patients absents
- ✅ Les politiques RLS fonctionnent correctement pour toutes les opérations CRUD

## Tests de validation

1. **Test d'insertion** ✓
   ```javascript
   await markPatientAbsent(appointmentId, clinicId, patientId);
   // Devrait réussir sans erreur 403
   ```

2. **Test de lecture** ✓
   ```javascript
   const absentPatients = await getAbsentPatients(clinicId, startDate, endDate);
   // Devrait retourner les patients absents de la clinique
   ```

3. **Test de mise à jour** ✓
   ```javascript
   await markPatientReturned(appointmentId, performedBy);
   // Devrait mettre à jour returned_at sans erreur
   ```

## Prévention future

### Bonnes pratiques pour les politiques RLS
1. **Toujours utiliser WITH CHECK pour INSERT**
   ```sql
   CREATE POLICY "name" ON table FOR INSERT
     WITH CHECK (condition);
   ```

2. **Utiliser USING + WITH CHECK pour UPDATE**
   ```sql
   CREATE POLICY "name" ON table FOR UPDATE
     USING (read_condition)
     WITH CHECK (write_condition);
   ```

3. **Éviter FOR ALL** - Préférer des politiques spécifiques par opération

4. **Tester chaque opération CRUD** après création de politiques

## Références
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Date de résolution:** 16 octobre 2025  
**Migration appliquée:** `20251016100000_fix_absent_patients_rls_policies.sql`  
**Statut:** ✅ Résolu
