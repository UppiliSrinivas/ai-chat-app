import UserMessage, { type UserMessageProps } from './UserMessage'
import AssistantMessage, { type AssistantMessageProps } from './AssistantMessage'

export type MessageProps =
  | ({ role: 'user' } & UserMessageProps)
  | ({ role: 'assistant' } & AssistantMessageProps)

export default function Message(props: MessageProps) {
  if (props.role === 'user') {
    const { role, ...userProps } = props
    void role
    return (
      <div className="flex justify-end py-2">
        <UserMessage {...userProps} />
      </div>
    )
  }

  const { role, ...assistantProps } = props
  void role
  return (
    <div className="flex justify-start py-2">
      <AssistantMessage {...assistantProps} />
    </div>
  )
}
