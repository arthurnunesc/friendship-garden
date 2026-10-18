import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { AddFriendForm } from './AddFriendForm'
import { FriendListItem } from './FriendListItem'
import { createFriend } from '../garden/Friend'

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' }, StyleSheet: { create: (styles: unknown) => styles },
}))
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })

async function pressText(view: ReactTestRenderer, text: string) {
  const button = view.root.findAllByType('TouchableOpacity' as never).find((node) =>
    node.findAllByType('Text' as never).some((child) => child.props.children === text))!
  await act(async () => { button.props.onPress() })
}

it('keeps the add form draft after false and blocks duplicate submissions while saving', async () => {
  let finish!: (result: boolean) => void
  const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
  const onCancel = vi.fn()
  let view!: ReactTestRenderer
  await act(async () => { view = create(<AddFriendForm onSubmit={onSubmit} onCancel={onCancel} />) })
  try {
    await act(async () => { view.root.findByType('TextInput' as never).props.onChangeText('  Alice  ') })
    await pressText(view, 'add to garden')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await pressText(view, 'cancel')
    expect(onCancel).not.toHaveBeenCalled()
    expect(view.root.findByType('TextInput' as never).props.editable).toBe(false)
    expect(view.root.findAllByType('Text' as never).some((node) => node.props.children === 'saving…')).toBe(true)
    await pressText(view, 'saving…')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await act(async () => { finish(false) })
    expect(view.root.findByType('TextInput' as never).props.value).toBe('  Alice  ')
    expect(view.root.findAllByType('Text' as never).some((node) => String(node.props.children).includes('could not save'))).toBe(true)
  } finally { await act(async () => { view.unmount() }) }
})

it.each(['chat', 'edit', 'remove'])('does not dismiss %s through the backdrop or system back while saving', async (kind) => {
  let finish!: (result: boolean) => void
  const pending = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
  let view!: ReactTestRenderer
  const friend = createFriend({ name: 'Alice' })
  await act(async () => { view = create(<FriendListItem friend={friend} wateringState="watered" daysSince={0}
    hasBirthday={false} onWater={pending} onEdit={pending} onRemove={pending} />) })
  try {
    if (kind === 'chat') {
      await pressText(view, '+')
      await act(async () => { view.root.findByProps({ accessibilityLabel: 'Conversation note' }).props.onChangeText('Keep this draft') })
    } else {
      await pressText(view, '▼')
      await pressText(view, kind === 'edit' ? 'edit' : 'remove from garden')
    }
    await pressText(view, kind === 'remove' ? 'yes, remove' : 'save')
    const modal = view.root.findAllByType('Modal' as never).find(node => node.props.visible)!
    await act(async () => {
      modal.props.onRequestClose()
      modal.findAllByType('Pressable' as never)[0].props.onPress()
    })
    expect(modal.props.visible).toBe(true)
    expect(pending).toHaveBeenCalledOnce()
    await act(async () => { finish(false) })
    expect(modal.props.visible).toBe(true)
    if (kind === 'chat') expect(view.root.findByProps({ accessibilityLabel: 'Conversation note' }).props.value).toBe('Keep this draft')
    expect(modal.findAllByType('Text' as never).some(node => String(node.props.children).includes('could not save'))).toBe(true)
  } finally { await act(async () => { view.unmount() }) }
})

it('keeps watering details open on false and dismisses them on legacy void success', async () => {
  const friend = createFriend({ name: 'Alice' })
  const onWater = vi.fn().mockResolvedValueOnce(false).mockReturnValueOnce(undefined)
  let view!: ReactTestRenderer
  await act(async () => { view = create(<FriendListItem friend={friend} wateringState="watered" daysSince={0}
    hasBirthday={false} onWater={onWater} onEdit={vi.fn()} onRemove={vi.fn()} />) })
  try {
    await pressText(view, '+')
    await pressText(view, 'save')
    expect(view.root.findAllByType('Modal' as never).some((node) => node.props.visible)).toBe(true)
    await pressText(view, 'save')
    expect(view.root.findAllByType('Modal' as never).every((node) => !node.props.visible)).toBe(true)
    expect(onWater).toHaveBeenCalledTimes(2)
  } finally { await act(async () => { view.unmount() }) }
})

it('keeps removal confirmation open after a rejected save', async () => {
  const friend = createFriend({ name: 'Alice' })
  const onRemove = vi.fn().mockRejectedValue(new Error('offline'))
  let view!: ReactTestRenderer
  await act(async () => { view = create(<FriendListItem friend={friend} wateringState="watered" daysSince={0}
    hasBirthday={false} onWater={vi.fn()} onEdit={vi.fn()} onRemove={onRemove} />) })
  try {
    await pressText(view, '▼')
    await pressText(view, 'remove from garden')
    await pressText(view, 'yes, remove')
    expect(onRemove).toHaveBeenCalledWith(friend.id)
    expect(view.root.findAllByType('Modal' as never).some((node) => node.props.visible)).toBe(true)
    expect(view.root.findAllByType('Text' as never).some((node) => String(node.props.children).includes('could not save'))).toBe(true)
  } finally { await act(async () => { view.unmount() }) }
})
