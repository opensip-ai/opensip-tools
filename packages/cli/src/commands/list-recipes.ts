/**
 * list-recipes command — list all available fitness recipes
 */

import { builtInRecipesByName } from '@opensip-tools/core';
import type { ListRecipesResult } from '../types.js';

// ---------------------------------------------------------------------------
// listRecipes
// ---------------------------------------------------------------------------

export function listRecipes(): ListRecipesResult {
  const recipes = [...builtInRecipesByName.entries()].map(([name, recipe]) => {
    const checkCount = recipe.checks.type === 'all'
      ? 'all checks'
      : recipe.checks.type === 'explicit'
        ? `${(recipe.checks as unknown as { checkIds: string[] }).checkIds.length} checks`
        : 'pattern-based';
    return { name, description: recipe.description, checkCount };
  });

  return {
    type: 'list-recipes',
    recipes,
  };
}
