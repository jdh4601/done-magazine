// Returns the cards without `id` and the scene index to select next (cover is scene 0).
// The magazine needs at least one body page between the cover and the ending.
export function deletePage(cards,id) {
  const index=cards.findIndex(c=>c.id===id);
  if(index<0||cards.length<=1)return null;
  const next=cards.filter(c=>c.id!==id);
  return {cards:next,selected:Math.min(index,next.length-1)+1};
}
