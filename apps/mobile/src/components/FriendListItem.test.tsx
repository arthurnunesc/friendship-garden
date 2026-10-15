import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
import { FriendListItem } from './FriendListItem'
import { createFriend } from '../garden/Friend'

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  Pressable: 'Pressable', Modal: 'Modal', StyleSheet: { create: (styles: unknown) => styles },
}))
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })

it('keeps modal containers from grouping their accessible child controls', async () => {
  let view!: ReactTestRenderer
  await act(async () => {
    view = create(<FriendListItem friend={createFriend({ name: 'Alice' })}
      wateringState="watered" daysSince={0} hasBirthday={false}
      onWater={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
  })
  try {
    const containers = view.root.findAllByType('Pressable' as never)
    expect(containers).toHaveLength(6)
    for (const container of containers) expect(container.props.accessible).toBe(false)
  } finally {
    await act(async () => { view.unmount() })
  }
})

it('lets users edit named fields, save a cadence change, and cancel removal', async () => {
  const friend = createFriend({ name: 'Alice' })
  const onEdit = vi.fn()
  const onRemove = vi.fn()
  let view!: ReactTestRenderer
  await act(async () => {
    view = create(<FriendListItem friend={friend} wateringState="watered" daysSince={0}
      hasBirthday={false} onWater={vi.fn()} onEdit={onEdit} onRemove={onRemove} />)
  })
  const press = async (text: string) => {
    const button = view.root.findAllByType('TouchableOpacity' as never).find((node) =>
      node.findAllByType('Text' as never).some((child) => child.props.children === text))!
    await act(async () => { button.props.onPress() })
  }
  try {
    await press('▼')
    await press('edit')
    await act(async () => {
      view.root.findByProps({ accessibilityLabel: 'Friend name' }).props.onChangeText('Renamed Alice')
      view.root.findByProps({ accessibilityLabel: 'Birthday, YYYY-MM-DD' }).props.onChangeText('1990-05-14')
    })
    await press('every week')
    // Scope duplicate save/cancel labels to the open modal, as a native user would.
    const modal = view.root.findAllByType('Modal' as never).find((node) => node.props.visible)!
    const save = modal.findAllByType('TouchableOpacity' as never).find((node) =>
      node.findAllByType('Text' as never).some((child) => child.props.children === 'save'))!
    await act(async () => { save.props.onPress() })
    expect(onEdit).toHaveBeenCalledWith(friend.id, 'Renamed Alice', '1990-05-14', 7)
    await press('remove from garden')
    const confirmation = view.root.findAllByType('Modal' as never).find((node) => node.props.visible)!
    const cancel = confirmation.findAllByType('TouchableOpacity' as never).find((node) =>
      node.findAllByType('Text' as never).some((child) => child.props.children === 'cancel'))!
    await act(async () => { cancel.props.onPress() })
    expect(onRemove).not.toHaveBeenCalled()
    await press('remove from garden')
    await press('yes, remove')
    expect(onRemove).toHaveBeenCalledWith(friend.id)
  } finally {
    await act(async () => { view.unmount() })
  }
})

it('keeps conversation save, cancel, and backdrop dismissal working', async () => {
  const friend = createFriend({ name: 'Alice' })
  const onWater = vi.fn()
  let view!: ReactTestRenderer
  await act(async () => {
    view = create(<FriendListItem friend={friend} wateringState="watered" daysSince={0}
      hasBirthday={false} onWater={onWater} onEdit={vi.fn()} onRemove={vi.fn()} />)
  })
  const press = async (text: string) => {
    const openModal = view.root.findAllByType('Modal' as never).find((node) => node.props.visible)
    const button = (openModal ?? view.root).findAllByType('TouchableOpacity' as never).find((node) =>
      node.findAllByType('Text' as never).some((child) => child.props.children === text))!
    await act(async () => { button.props.onPress() })
  }
  try {
    await press('+')
    await act(async () => {
      view.root.findByProps({ accessibilityLabel: 'Conversation note' }).props.onChangeText('Discard me')
    })
    await press('cancel')
    expect(onWater).not.toHaveBeenCalled()
    await press('+')
    expect(view.root.findByProps({ accessibilityLabel: 'Conversation note' }).props.value).toBe('')
    const modal = view.root.findAllByType('Modal' as never).find((node) => node.props.visible)!
    await act(async () => { modal.findAllByType('Pressable' as never)[0].props.onPress() })
    expect(onWater).not.toHaveBeenCalled()
    expect(view.root.findAllByType('Modal' as never).every((node) => !node.props.visible)).toBe(true)
    await press('+')
    await act(async () => {
      view.root.findByProps({ accessibilityLabel: 'Conversation note' }).props.onChangeText('A good chat')
    })
    await press('save')
    expect(onWater).toHaveBeenCalledWith(friend.id, undefined, 'A good chat')
  } finally {
    await act(async () => { view.unmount() })
  }
})
